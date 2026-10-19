import { create } from 'zustand';
import { persist, type PersistStorage, type StorageValue } from 'zustand/middleware';
import { del, get, set } from 'idb-keyval';
import { DEFAULT_AREAS } from './lib/defaults';
import type { NewRow, RowOf, TableName, Tables } from './lib/types';

/** startHour~endHour: 하루 기록 막대에 보여줄 시간 범위 */
export type Settings = { startHour: number; endHour: number };
export type SyncStatus = 'local' | 'signed-out' | 'syncing' | 'synced' | 'offline' | 'error';

type Persisted = {
  data: Tables;
  /** 아직 서버에 안 올라간 행: `${table}:${id}` */
  dirty: Record<string, true>;
  settings: Settings;
  /** 테이블별로 마지막으로 받아온 synced_at */
  cursors: Partial<Record<TableName, string>>;
};

export type State = Persisted & {
  hydrated: boolean;
  syncStatus: SyncStatus;
  syncError: string | null;
  lastSyncedAt: string | null;
  userEmail: string | null;
};

const EPOCH = new Date(0).toISOString();

export const emptyTables = (): Tables => ({
  areas: {}, habits: {}, habit_logs: {}, projects: {}, tasks: {}, sessions: {}, plan_slots: {}, reviews: {}, bucket_items: {}, time_blocks: {},
});

/**
 * v3: 할 일·시간 기록 구조가 바뀌었다.
 *  - 할 일: 4칸(quadrant) → ★중요(1·2칸이던 것), 마감·예상 시간·프로젝트 칸 추가
 *  - 칠하던 타임바(실제 칸) → 이어진 칸끼리 묶어 타이머 기록(세션)으로 옮긴다
 */
function migrateV3(p: Persisted): Persisted {
  const data = { ...emptyTables(), ...p.data } as Tables & Record<string, unknown>;
  const dirty = { ...p.dirty };
  const now = new Date().toISOString();

  const tasks: Tables['tasks'] = {};
  for (const [id, raw] of Object.entries(data.tasks)) {
    const t = raw as Partial<Tables['tasks'][string]> & { quadrant?: string };
    tasks[id] = {
      id,
      title: t.title ?? '',
      project_id: t.project_id ?? '',
      date: t.date ?? '',
      due: t.due ?? '',
      time: t.time ?? '',
      estimate: t.estimate ?? 0,
      important: t.important ?? (t.quadrant === 'q1' || t.quadrant === 'q2'),
      done: t.done ?? false,
      done_on: t.done_on ?? (t.done ? (t.date ?? '') : ''),
      sort: t.sort ?? 0,
      updated_at: now,
      deleted: t.deleted ?? false,
    };
    dirty[`tasks:${id}`] = true;
  }

  const sessions: Tables['sessions'] = { ...data.sessions };
  const runs = new Map<string, { date: string; area: string; from: number; to: number }[]>();
  const actual = Object.values(data.time_blocks).filter((b) => !b.deleted && b.kind === 'actual');
  actual.sort((a, b) => a.date.localeCompare(b.date) || a.slot - b.slot);
  for (const b of actual) {
    const list = runs.get(b.date) ?? [];
    const last = list[list.length - 1];
    if (last && last.area === b.area_id && last.to === b.slot) last.to = b.slot + 1;
    else list.push({ date: b.date, area: b.area_id, from: b.slot, to: b.slot + 1 });
    runs.set(b.date, list);
  }
  for (const list of runs.values()) {
    for (const r of list) {
      const [y, m, d] = r.date.split('-').map(Number);
      const at = (slot: number) => new Date(y, m - 1, d, 0, slot * 30).toISOString();
      const id = `tb_${r.date}_${r.from}`;
      sessions[id] = {
        id, task_id: '', project_id: '', area_id: r.area, habit_id: '', title: '',
        start: at(r.from), end: at(r.to), updated_at: now, deleted: false,
      };
      dirty[`sessions:${id}`] = true;
    }
  }

  // 없어진 테이블(세부 항목·목표)과 그 대기열은 버린다
  delete data.activities;
  delete data.goals;
  for (const k of Object.keys(dirty)) if (k.startsWith('activities:') || k.startsWith('goals:')) delete dirty[k];

  return { ...p, data: { ...data, tasks, sessions } as Tables, dirty };
}

/** 사용자가 직접 만든 "일상" 범주 (기본 'daily'와 다른 것) */
export const userDailyArea = (areas: Tables['areas']) =>
  Object.values(areas).find((a) => !a.deleted && a.id !== 'daily' && a.name.trim() === '일상');

// 기본 영역은 EPOCH 시각으로 넣어서, 다른 기기에서 고친 값이 항상 이기게 한다
function withDefaults(data: Tables): Tables {
  const areas = { ...data.areas };
  for (const a of DEFAULT_AREAS) {
    if (areas[a.id]) continue;
    // 이미 직접 만든 "일상"이 있으면 기본 일상은 만들지 않는다
    if (a.id === 'daily' && userDailyArea(areas)) continue;
    areas[a.id] = { ...a, updated_at: EPOCH, deleted: false };
  }
  return { ...data, areas };
}

/**
 * v5: v4에서 기본 범주 "일상"(id 'daily')을 만들었는데, 사용자가 이미 "일상"을 만들어 둔 경우가 있었다.
 * → 기본 일상에 들어간 것을 전부 사용자의 일상으로 옮기고 기본 일상은 지운다.
 */
function migrateV5(p: Persisted): Persisted {
  const target = userDailyArea(p.data.areas);
  if (!target) return p;
  const now = new Date().toISOString();
  const data = { ...p.data };
  const dirty = { ...p.dirty };
  const repoint = <T extends 'tasks' | 'habits' | 'sessions' | 'projects' | 'bucket_items'>(t: T) => {
    const next = { ...data[t] } as Record<string, Tables[T][string]>;
    for (const [id, row] of Object.entries(next)) {
      if ((row as { area_id?: string }).area_id === 'daily') {
        next[id] = { ...row, area_id: target.id, updated_at: now };
        dirty[`${t}:${id}`] = true;
      }
    }
    (data as Record<string, unknown>)[t] = next;
  };
  (['tasks', 'habits', 'sessions', 'projects', 'bucket_items'] as const).forEach(repoint);
  if (data.areas.daily) {
    data.areas = { ...data.areas, daily: { ...data.areas.daily, deleted: true, updated_at: now } };
    dirty['areas:daily'] = true;
  }
  return { ...p, data, dirty };
}

/**
 * v2: 기본 범주가 커리어·취미·공부·운동으로 바뀌었다.
 * 한 번도 손대지 않은(EPOCH) 기본값만 고친다 — 사용자가 고친 이름·색은 그대로 둔다.
 */
function migrateAreasV2(data: Tables): Tables {
  const areas = { ...data.areas };
  const untouched = (id: string) => areas[id] && areas[id].updated_at === EPOCH;
  const rename: Record<string, [string, string, number]> = {
    career: ['커리어', '커리어', 0],
    hobby: ['취미', '취미', 1],
    intellect: ['지적', '공부', 2],
    body: ['신체', '운동', 3],
  };
  for (const [id, [from, to, sort]] of Object.entries(rename)) {
    if (untouched(id) && areas[id].name === from) areas[id] = { ...areas[id], name: to, sort };
  }
  // 예전 기본값 사회·낭비: 손대지 않았고 아무 기록에도 안 쓰였으면 없앤다
  const used = new Set<string>();
  for (const b of Object.values(data.time_blocks ?? {})) if (!b.deleted) used.add(b.area_id);
  for (const h of Object.values(data.habits ?? {})) if (!h.deleted) used.add(h.area_id);
  for (const id of ['social', 'waste']) if (untouched(id) && !used.has(id)) delete areas[id];
  return { ...data, areas };
}

/**
 * v4:
 *  - "일회성"이 없어지고 기본 범주 "일상"이 생겼다 → 프로젝트 없는 할 일은 일상으로
 *  - 실제 칸을 여러 번 누르면 같은 기록이 겹쳐 쌓이던 버그의 흔적 정리:
 *    같은 일 · 같은 시작 · 같은 끝인 기록은 하나만 남긴다
 */
function migrateV4(p: Persisted): Persisted {
  const now = new Date().toISOString();
  const tasks = { ...p.data.tasks };
  const sessions = { ...p.data.sessions };
  const dirty = { ...p.dirty };
  for (const [id, t] of Object.entries(tasks)) {
    if (!t.project_id && !t.area_id) {
      tasks[id] = { ...t, area_id: 'daily', updated_at: now };
      dirty[`tasks:${id}`] = true;
    }
  }
  const seen = new Set<string>();
  for (const s of Object.values(sessions).sort((a, b) => a.updated_at.localeCompare(b.updated_at))) {
    if (s.deleted || !s.end) continue;
    const key = [s.task_id, s.habit_id, s.project_id, s.title, s.start, s.end].join('|');
    if (seen.has(key)) {
      sessions[s.id] = { ...s, deleted: true, updated_at: now };
      dirty[`sessions:${s.id}`] = true;
    } else seen.add(key);
  }
  return { ...p, data: { ...p.data, tasks, sessions }, dirty };
}

// IndexedDB 저장은 0.4초 모아서 한 번에 (입력할 때마다 디스크에 쓰지 않도록)
let pending: { name: string; value: StorageValue<Persisted> } | null = null;
let flushTimer: ReturnType<typeof setTimeout> | undefined;
function flush() {
  clearTimeout(flushTimer);
  if (pending) void set(pending.name, pending.value);
  pending = null;
}
const storage: PersistStorage<Persisted> = {
  getItem: async (name) => (await get<StorageValue<Persisted>>(name)) ?? null,
  setItem: (name, value) => {
    pending = { name, value };
    clearTimeout(flushTimer);
    flushTimer = setTimeout(flush, 400);
  },
  removeItem: (name) => del(name),
};
window.addEventListener('pagehide', flush);
document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && flush());

export const useStore = create<State>()(
  persist<State, [], [], Persisted>(
    () => ({
      data: withDefaults(emptyTables()),
      dirty: {},
      settings: { startHour: 6, endHour: 24 },
      cursors: {},
      hydrated: false,
      syncStatus: 'local',
      syncError: null,
      lastSyncedAt: null,
      userEmail: null,
    }),
    {
      name: 'focus-planner',
      version: 5,
      migrate: (persisted, version) => {
        let p = persisted as Persisted;
        if (!p?.data) return p;
        if (version < 2) p = { ...p, data: migrateAreasV2(p.data) };
        if (version < 3) p = migrateV3(p);
        if (version < 4) p = migrateV4(p);
        if (version < 5) p = migrateV5(p);
        return p;
      },
      storage,
      partialize: (s) => ({ data: s.data, dirty: s.dirty, settings: s.settings, cursors: s.cursors }),
      merge: (persisted, current) => {
        const p = persisted as Partial<Persisted> | undefined;
        return { ...current, ...p, data: withDefaults({ ...emptyTables(), ...p?.data }) };
      },
      onRehydrateStorage: () => () => useStore.setState({ hydrated: true }),
    },
  ),
);

let onChange: () => void = () => {};
export const setOnChange = (fn: () => void) => {
  onChange = fn;
};

/** 모든 쓰기는 여기로: updated_at 갱신 + 동기화 대기열에 추가 */
export function putRows<T extends TableName>(table: T, rows: NewRow<T>[]) {
  if (!rows.length) return;
  const now = new Date().toISOString();
  useStore.setState((s) => {
    const next = { ...s.data[table] } as Record<string, RowOf<T>>;
    const dirty = { ...s.dirty };
    for (const r of rows) {
      next[r.id] = { ...r, deleted: r.deleted ?? false, updated_at: now } as RowOf<T>;
      dirty[`${table}:${r.id}`] = true;
    }
    return { data: { ...s.data, [table]: next }, dirty };
  });
  onChange();
}

export function patchRow<T extends TableName>(table: T, id: string, patch: Partial<RowOf<T>>) {
  const cur = useStore.getState().data[table][id];
  if (cur) putRows(table, [{ ...cur, ...patch } as NewRow<T>]);
}
