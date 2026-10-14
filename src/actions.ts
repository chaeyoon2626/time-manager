import { todayKey } from './lib/date';
import { MAX_AREAS } from './lib/defaults';
import { blockId, logId, reviewId, uid } from './lib/ids';
import type { Activity, Area, BlockKind, BucketItem, Habit, Quadrant, Review, ReviewLevel, Tables, Task, TimeBlock } from './lib/types';
import { TABLES } from './lib/types';
import { patchRow, putRows, useStore, type Settings } from './store';

const data = () => useStore.getState().data;

// ---------- 습관 ----------

export function toggleHabit(habitId: string, date: string) {
  const id = logId(habitId, date);
  const cur = data().habit_logs[id];
  putRows('habit_logs', [{ id, habit_id: habitId, date, deleted: cur ? !cur.deleted : false }]);
}

export function addHabit(title: string, area_id: string, weekdays: number[] = []) {
  putRows('habits', [{ id: uid(), title, area_id, weekdays, sort: Date.now(), archived: false, created_on: todayKey() }]);
}

export const updateHabit = (id: string, patch: Partial<Habit>) => patchRow('habits', id, patch);

// ---------- 포커스 보드 ----------

export function addTask(date: string, quadrant: Quadrant, title: string) {
  putRows('tasks', [{ id: uid(), date, quadrant, title, done: false, sort: Date.now() }]);
}

export const updateTask = (id: string, patch: Partial<Task>) => patchRow('tasks', id, patch);
export const deleteTask = (id: string) => patchRow('tasks', id, { deleted: true });

export const overdueTasks = (tasks: Tables['tasks'], date: string) =>
  Object.values(tasks).filter((t) => !t.deleted && !t.done && t.date < date);

/** 지난 날짜의 미완료 할 일을 date로 옮긴다 */
export function pullOverdue(date: string) {
  putRows('tasks', overdueTasks(data().tasks, date).map((t) => ({ ...t, date })));
}

// ---------- 타임바 ----------

/** 붓: 영역 + (선택) 세부 항목. activity가 ''이면 영역만 */
export type Brush = { area: string; activity: string };

/** brush가 null이면 지우기 */
export function setBlocks(date: string, kind: BlockKind, slots: number[], brush: Brush | null) {
  const blocks = data().time_blocks;
  const rows: Omit<TimeBlock, 'updated_at'>[] = [];
  for (const slot of slots) {
    const id = blockId(date, kind, slot);
    const cur = blocks[id];
    const alive = cur && !cur.deleted;
    if (brush === null) {
      if (alive) rows.push({ ...cur, activity_id: cur.activity_id ?? '', deleted: true });
    } else if (!alive || cur.area_id !== brush.area || (cur.activity_id ?? '') !== brush.activity) {
      rows.push({ id, date, kind, slot, area_id: brush.area, activity_id: brush.activity, deleted: false });
    }
  }
  putRows('time_blocks', rows);
}

/** 실제 칸이 비어 있는 곳만 계획대로 채운다 */
export function copyPlanToActual(date: string) {
  const blocks = data().time_blocks;
  const rows: Omit<TimeBlock, 'updated_at'>[] = [];
  for (let s = 0; s < 48; s++) {
    const p = blocks[blockId(date, 'plan', s)];
    const a = blocks[blockId(date, 'actual', s)];
    if (p && !p.deleted && (!a || a.deleted)) {
      rows.push({
        id: blockId(date, 'actual', s),
        date,
        kind: 'actual',
        slot: s,
        area_id: p.area_id,
        activity_id: p.activity_id ?? '',
        deleted: false,
      });
    }
  }
  putRows('time_blocks', rows);
}

// ---------- 세부 항목 ----------

/** 같은 영역에 같은 이름이 있으면(보관한 것 포함) 그걸 되살려 쓴다 */
export function addActivity(area_id: string, name: string): string {
  const same = Object.values(data().activities).find(
    (a) => !a.deleted && a.area_id === area_id && a.name.trim() === name.trim(),
  );
  if (same) {
    if (same.archived) patchRow('activities', same.id, { archived: false });
    return same.id;
  }
  const id = uid();
  putRows('activities', [{ id, area_id, name: name.trim(), sort: Date.now(), archived: false }]);
  return id;
}

export const updateActivity = (id: string, patch: Partial<Activity>) => patchRow('activities', id, patch);

/** 보관만 한다 — 이미 칠한 칸은 그 이름을 계속 보여준다 */
export const archiveActivity = (id: string) => patchRow('activities', id, { archived: true });

// ---------- 회고 ----------

export function saveReview(level: ReviewLevel, period_key: string, patch: Partial<Review>) {
  const id = reviewId(level, period_key);
  const cur = data().reviews[id];
  const base = cur ?? { id, level, period_key, line: '', good: '', bad: '', why: '', next_action: '' };
  putRows('reviews', [{ ...base, ...patch, deleted: false }]);
}

// ---------- 버킷리스트 ----------

export function addBucket(title: string, minutes: number, area_id: string) {
  putRows('bucket_items', [{ id: uid(), title, minutes, area_id, done: false, done_on: '', sort: Date.now() }]);
}

export const updateBucket = (id: string, patch: Partial<BucketItem>) => patchRow('bucket_items', id, patch);
export const deleteBucket = (id: string) => patchRow('bucket_items', id, { deleted: true });

export const toggleBucket = (b: BucketItem) =>
  updateBucket(b.id, b.done ? { done: false, done_on: '' } : { done: true, done_on: todayKey() });

/** 버킷리스트 항목을 오늘 포커스 보드의 '성장 투자' 칸에 넣는다 */
export const bucketToToday = (b: BucketItem) => addTask(todayKey(), 'q2', b.title);

// ---------- 설정 ----------

export const updateArea = (id: string, patch: Partial<Area>) => patchRow('areas', id, patch);

/** 범주 추가 (최대 MAX_AREAS개). 추가했으면 id, 꽉 찼으면 null */
export function addArea(name: string, color: string): string | null {
  const alive = Object.values(data().areas).filter((a) => !a.deleted);
  if (alive.length >= MAX_AREAS) return null;
  const id = uid();
  const sort = Math.max(-1, ...alive.map((a) => a.sort)) + 1;
  putRows('areas', [{ id, name: name.trim(), color, required: false, is_waste: false, sort }]);
  return id;
}

/** 범주 삭제 — 목록·붓에서만 빠진다. 이미 칠한 칸은 원래 이름과 색으로 남는다 */
export const deleteArea = (id: string) => patchRow('areas', id, { deleted: true });

export const updateSettings = (patch: Partial<Settings>) =>
  useStore.setState((s) => ({ settings: { ...s.settings, ...patch } }));

export function exportData() {
  const blob = new Blob([JSON.stringify({ app: 'focus-planner', version: 1, data: data() }, null, 1)], {
    type: 'application/json',
  });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `focus-planner-${todayKey()}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

/** 백업 파일을 현재 데이터 위에 덮어쓴다 (같은 id는 백업 값으로) */
export async function importData(file: File) {
  const parsed = JSON.parse(await file.text());
  if (parsed?.app !== 'focus-planner' || !parsed.data) throw new Error('포커스 플래너 백업 파일이 아니에요.');
  for (const t of TABLES) {
    const rows = Object.values(parsed.data[t] ?? {}) as never[];
    putRows(t, rows);
  }
}
