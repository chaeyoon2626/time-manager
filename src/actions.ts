import { todayKey, weekStart } from './lib/date';
import { MAX_AREAS } from './lib/defaults';
import { logId, reviewId, uid } from './lib/ids';
import { parseTask } from './lib/parse';
import type { Area, BucketItem, Habit, Milestone, Project, ProjectKind, Review, ReviewLevel, Session, Task } from './lib/types';
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

// ---------- 할 일 ----------

/** #이름으로 고를 수 있는 것: 진행 중인 프로젝트와 꾸준히 모두 */
const activeProjects = () => Object.values(data().projects).filter((p) => !p.deleted && !p.done);

/**
 * 한 줄 입력으로 할 일 추가.
 * 날짜를 안 적었을 때: 프로젝트 할 일이면 '날짜 미정', 일회성이면 defaultDate(보통 보고 있는 날)
 */
export function addTaskFromText(text: string, opts: { defaultDate: string; projectId?: string }) {
  const p = parseTask(text, activeProjects());
  if (!p.title) return null;
  const project_id = p.project_id ?? opts.projectId ?? '';
  const task: Omit<Task, 'updated_at' | 'deleted'> = {
    id: uid(),
    title: p.title,
    project_id,
    date: p.date ?? (project_id ? '' : opts.defaultDate),
    due: p.due ?? '',
    time: p.time ?? '',
    estimate: p.estimate ?? 0,
    important: p.important ?? false,
    done: false,
    done_on: '',
    sort: Date.now(),
  };
  putRows('tasks', [task]);
  return task.id;
}

export const updateTask = (id: string, patch: Partial<Task>) => patchRow('tasks', id, patch);
export const deleteTask = (id: string) => patchRow('tasks', id, { deleted: true });
export const toggleTask = (t: Task) =>
  updateTask(t.id, t.done ? { done: false, done_on: '' } : { done: true, done_on: todayKey() });

// ---------- 프로젝트 · 꾸준히 ----------

export function addProject(title: string, area_id: string, kind: ProjectKind, due = '', hours = 0) {
  const id = uid();
  putRows('projects', [
    {
      id, title: title.trim(), area_id, kind, due, done: false, done_on: '', sort: Date.now(),
      targets: kind === 'steady' && hours > 0 ? [{ from: weekStart(todayKey()), hours }] : [],
    },
  ]);
  return id;
}

export const updateProject = (id: string, patch: Partial<Project>) => patchRow('projects', id, patch);
export const deleteProject = (id: string) => patchRow('projects', id, { deleted: true });
export const toggleProjectDone = (p: Project) =>
  updateProject(p.id, p.done ? { done: false, done_on: '' } : { done: true, done_on: todayKey() });

// ---------- 성과 목표 ----------

export const updateCurrent = (p: Project, current: string) => updateProject(p.id, { current, current_on: todayKey() });

/** 지금 진행 중인 목표 = 아직 달성 안 한 첫 목표 */
export const activeMilestone = (p: Project): Milestone | undefined => (p.milestones ?? []).find((m) => !m.done);

/** 새 목표는 바로 앞 목표를 달성한 날(없으면 오늘)부터 시작한 것으로 본다 */
export function addMilestone(p: Project, title: string, due: string, final: boolean) {
  const list = p.milestones ?? [];
  const lastDone = [...list].reverse().find((m) => m.done);
  const start = list.some((m) => !m.done) ? todayKey() : (lastDone?.done_on ?? todayKey());
  updateProject(p.id, {
    milestones: [...list, { id: uid(), title: title.trim(), start, due, done: false, done_on: '', final }],
  });
}

export function updateMilestone(p: Project, id: string, patch: Partial<Milestone>) {
  updateProject(p.id, { milestones: (p.milestones ?? []).map((m) => (m.id === id ? { ...m, ...patch } : m)) });
}

/** 달성하면 다음 목표는 오늘부터 시작한 것으로 (투입 시간을 그날부터 센다) */
export function toggleMilestone(p: Project, m: Milestone) {
  const today = todayKey();
  const list = p.milestones ?? [];
  if (m.done) {
    updateMilestone(p, m.id, { done: false, done_on: '' });
    return;
  }
  const idx = list.findIndex((x) => x.id === m.id);
  const nextIdx = list.findIndex((x, i) => i > idx && !x.done);
  updateProject(p.id, {
    milestones: list.map((x, i) =>
      i === idx ? { ...x, done: true, done_on: today } : i === nextIdx ? { ...x, start: today } : x,
    ),
  });
}

export const deleteMilestone = (p: Project, id: string) =>
  updateProject(p.id, { milestones: (p.milestones ?? []).filter((m) => m.id !== id) });

/** 꾸준히 목표 변경: 이번 주부터 적용. 이전 목표는 기록으로 남는다 */
export function setTarget(p: Project, hours: number) {
  const from = weekStart(todayKey());
  const targets = (p.targets ?? []).filter((t) => t.from !== from);
  targets.push({ from, hours });
  targets.sort((a, b) => a.from.localeCompare(b.from));
  updateProject(p.id, { targets });
}

// ---------- 타이머 ----------

export const runningSession = (): Session | undefined =>
  Object.values(data().sessions).find((s) => !s.deleted && !s.end);

export type TimerTarget = { task_id?: string; project_id?: string; area_id?: string; habit_id?: string; title: string };

/** 1분도 안 된 기록은 실수로 누른 것으로 보고 지운다 */
const endRun = (run: Session, now: string): Omit<Session, 'updated_at'> => ({
  ...run,
  end: now,
  deleted: Date.parse(now) - Date.parse(run.start) < 60_000,
});

/** 시작하면 돌던 타이머는 지금 시각으로 끝낸다 (하나만 돈다) */
export function startTimer(t: TimerTarget) {
  const now = new Date().toISOString();
  const rows: Omit<Session, 'updated_at'>[] = [];
  const run = runningSession();
  if (run) rows.push(endRun(run, now));
  rows.push({
    id: uid(),
    task_id: t.task_id ?? '',
    project_id: t.project_id ?? '',
    area_id: t.area_id ?? '',
    habit_id: t.habit_id ?? '',
    title: t.title,
    start: now,
    end: '',
    deleted: false,
  });
  putRows('sessions', rows);
}

export function stopTimer() {
  const run = runningSession();
  if (run) putRows('sessions', [endRun(run, new Date().toISOString())]);
}

export function addSession(s: Omit<Session, 'id' | 'updated_at' | 'deleted'>) {
  putRows('sessions', [{ ...s, id: uid() }]);
}
export const updateSession = (id: string, patch: Partial<Session>) => patchRow('sessions', id, patch);
export const deleteSession = (id: string) => patchRow('sessions', id, { deleted: true });

/** 할 일·습관·꾸준히 중 무엇에 대한 타이머인지 → 범주·프로젝트를 채워서 시작 */
export function timerForTask(t: Task) {
  const p = data().projects[t.project_id];
  startTimer({ task_id: t.id, project_id: t.project_id, area_id: p?.area_id ?? '', title: t.title });
}
export const timerForProject = (p: Project) => startTimer({ project_id: p.id, area_id: p.area_id, title: p.title });
export const timerForHabit = (h: Habit) => startTimer({ habit_id: h.id, area_id: h.area_id, title: h.title });

// ---------- 버킷리스트 ----------

export function addBucket(title: string, minutes: number, area_id: string) {
  putRows('bucket_items', [{ id: uid(), title, minutes, area_id, done: false, done_on: '', sort: Date.now() }]);
}

export const updateBucket = (id: string, patch: Partial<BucketItem>) => patchRow('bucket_items', id, patch);
export const deleteBucket = (id: string) => patchRow('bucket_items', id, { deleted: true });

export const toggleBucket = (b: BucketItem) =>
  updateBucket(b.id, b.done ? { done: false, done_on: '' } : { done: true, done_on: todayKey() });

/** 버킷리스트 항목을 오늘 할 일(일회성)로 넣는다 */
export const bucketToToday = (b: BucketItem) =>
  putRows('tasks', [
    {
      id: uid(), title: b.title, project_id: '', date: todayKey(), due: '', time: '', estimate: b.minutes,
      important: false, done: false, done_on: '', sort: Date.now(),
    },
  ]);

// ---------- 회고 ----------

export function saveReview(level: ReviewLevel, period_key: string, patch: Partial<Review>) {
  const id = reviewId(level, period_key);
  const cur = data().reviews[id];
  const base = cur ?? { id, level, period_key, line: '', good: '', bad: '', why: '', next_action: '' };
  putRows('reviews', [{ ...base, ...patch, deleted: false }]);
}

// ---------- 범주 · 설정 ----------

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

/** 범주 삭제 — 목록에서만 빠진다. 이미 쌓인 기록은 원래 이름과 색으로 남는다 */
export const deleteArea = (id: string) => patchRow('areas', id, { deleted: true });

export const updateSettings = (patch: Partial<Settings>) =>
  useStore.setState((s) => ({ settings: { ...s.settings, ...patch } }));

export function exportData() {
  const blob = new Blob([JSON.stringify({ app: 'focus-planner', version: 3, data: data() }, null, 1)], {
    type: 'application/json',
  });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `time-manager-${todayKey()}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

/** 백업 파일을 현재 데이터 위에 덮어쓴다 (같은 id는 백업 값으로) */
export async function importData(file: File) {
  const parsed = JSON.parse(await file.text());
  if (parsed?.app !== 'focus-planner' || !parsed.data) throw new Error('이 앱의 백업 파일이 아니에요.');
  for (const t of TABLES) {
    const rows = Object.values(parsed.data[t] ?? {}) as never[];
    putRows(t, rows);
  }
}
