import { create } from 'zustand';
import { persist, type PersistStorage, type StorageValue } from 'zustand/middleware';
import { del, get, set } from 'idb-keyval';
import { DEFAULT_AREAS } from './lib/defaults';
import type { NewRow, RowOf, TableName, Tables } from './lib/types';

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
  areas: {}, habits: {}, habit_logs: {}, tasks: {}, time_blocks: {}, reviews: {}, bucket_items: {},
});

// 기본 영역은 EPOCH 시각으로 넣어서, 다른 기기에서 고친 값이 항상 이기게 한다
function withDefaults(data: Tables): Tables {
  const areas = { ...data.areas };
  for (const a of DEFAULT_AREAS) if (!areas[a.id]) areas[a.id] = { ...a, updated_at: EPOCH, deleted: false };
  return { ...data, areas };
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
      version: 1,
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
