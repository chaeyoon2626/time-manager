import { addDays, atTime, todayKey, weekdayIdx, weekStart } from './lib/date';
import { DAILY_AREA } from './lib/defaults';
import { logId, reviewId, uid } from './lib/ids';
import { parseTask } from './lib/parse';
import type { Area, BucketItem, BucketKind, Habit, Milestone, PlanSlot, Project, ProjectKind, Review, ReviewLevel, Session, Subarea, Target, Task } from './lib/types';
import { TABLES } from './lib/types';
import { patchRow, putRows, routineTaskId, userDailyArea, useStore, type Settings } from './store';

const data = () => useStore.getState().data;

// ---------- 반복 할 일 (예전 이름: 습관) ----------

export function toggleHabit(habitId: string, date: string) {
  const id = logId(habitId, date);
  const cur = data().habit_logs[id];
  putRows('habit_logs', [{ id, habit_id: habitId, date, deleted: cur ? !cur.deleted : false }]);
}

export function addHabit(title: string, area_id: string, weekdays: number[] = [], time = '', estimate = 0, project_id = '') {
  const id = uid();
  putRows('habits', [{ id, title, area_id, project_id, weekdays, time, estimate, sort: Date.now(), archived: false, created_on: todayKey() }]);
  return id;
}

export const updateHabit = (id: string, patch: Partial<Habit>) => patchRow('habits', id, patch);

// ---------- 할 일 ----------

/** #이름으로 고를 수 있는 것: 진행 중인 프로젝트와 꾸준히, 그리고 범주 */
const activeProjects = () => Object.values(data().projects).filter((p) => !p.deleted && !p.done);
const activeAreas = () => Object.values(data().areas).filter((a) => !a.deleted);

/** 기본 "일상" 범주 id — 사용자가 직접 만든 일상이 있으면 그쪽 */
export function dailyId() {
  const areas = data().areas;
  if (areas[DAILY_AREA] && !areas[DAILY_AREA].deleted) return DAILY_AREA;
  return userDailyArea(areas)?.id ?? DAILY_AREA;
}

/** 프로젝트 없는 할 일의 범주 (없으면 일상) */
export const taskArea = (t: Pick<Task, 'project_id' | 'area_id'>) =>
  data().projects[t.project_id]?.area_id ?? (t.area_id && t.area_id !== 'daily' ? t.area_id : dailyId());

/**
 * 한 줄 입력으로 할 일 추가.
 *  - 날짜를 안 적으면 할 날 = 기본 날짜(보통 오늘), 마감 = 할 날
 *  - "매일", "월수금", "평일" 같은 반복이 있으면 반복 할 일로 만든다
 * 만든 것의 종류와 id를 돌려준다.
 */
export function addTaskFromText(
  text: string,
  opts: { defaultDate?: string; projectId?: string; repeat?: number[] } = {},
): { kind: 'task' | 'habit' | 'subarea'; id: string } | null {
  const p = parseTask(text, activeProjects(), todayKey(), activeAreas());
  if (!p.title) return null;
  if (opts.repeat) p.repeat = opts.repeat; // 입력칸 옆 🔁 버튼으로 고른 반복
  const project_id = p.project_id ?? opts.projectId ?? '';
  const area_id = data().projects[project_id]?.area_id ?? p.area_id ?? dailyId();

  if (p.repeat) {
    // 프로젝트·꾸준히 안의 반복 = 고정 세부 영역, 그 밖은 반복 할 일
    if (project_id) {
      const id = addSubarea(project_id, p.title, {
        cadence: 'days', weekdays: p.repeat, mode: 'fixed', fixed_title: p.title, estimate: p.estimate ?? 0, time: p.time ?? '',
      });
      ensureRoutineTasks(opts.defaultDate ?? todayKey());
      return { kind: 'subarea', id };
    }
    return { kind: 'habit', id: addHabit(p.title, area_id, p.repeat, p.time ?? '', p.estimate ?? 0) };
  }
  const date = p.date ?? opts.defaultDate ?? todayKey();
  const task: Omit<Task, 'updated_at' | 'deleted'> = {
    id: uid(),
    title: p.title,
    project_id,
    area_id: project_id ? '' : area_id,
    date,
    due: p.due ?? date,
    time: p.time ?? '',
    estimate: p.estimate ?? 0,
    important: p.important ?? false,
    done: false,
    done_on: '',
    sort: Date.now(),
  };
  putRows('tasks', [task]);
  return { kind: 'task', id: task.id };
}

/**
 * 이미 적어둔 할 일을 반복 할 일로 바꾼다 (이름·범주·시각·예상 시간을 그대로 가져감).
 * 오늘 이미 끝낸 할 일이면 오늘 체크도 옮긴다. 원래 할 일은 지운다.
 */
export function convertTaskToHabit(t: Task, weekdays: number[]) {
  const today = todayKey();
  if (t.project_id) {
    // 프로젝트 할 일 → 고정 세부 영역. 오늘 이미 한 거면 오늘 할 일은 끝낸 상태로 이어간다
    const saId = addSubarea(t.project_id, t.title, {
      cadence: 'days', weekdays, mode: 'fixed', fixed_title: t.title, estimate: t.estimate, time: t.time,
    });
    deleteTask(t.id);
    ensureRoutineTasks(today);
    const rt = data().tasks[routineTaskId(saId, today)];
    if (rt && t.done && t.done_on === today) updateTask(rt.id, { done: true, done_on: today });
    return saId;
  }
  const id = addHabit(t.title, taskArea(t), weekdays, t.time, t.estimate);
  if (t.done && t.done_on === today) toggleHabit(id, today);
  deleteTask(t.id);
  return id;
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

// ---------- 세부 영역 ----------

export function addSubarea(project_id: string, name: string, opts: Partial<Subarea> = {}) {
  const id = uid();
  putRows('subareas', [
    {
      id, project_id, name: name.trim(), cadence: 'none', weekdays: [], mode: 'choose', fixed_title: '', estimate: 0, time: '',
      sort: Date.now(), archived: false, created_on: todayKey(), skips: [], ...opts,
    },
  ]);
  return id;
}

export const updateSubarea = (id: string, patch: Partial<Subarea>) => patchRow('subareas', id, patch);

/** 그날이 이 세부 영역을 하는 날인지 */
export const subareaDue = (sa: Subarea, date: string) =>
  !sa.deleted && !sa.archived && sa.cadence === 'days' && date >= sa.created_on &&
  (sa.weekdays.length === 0 || sa.weekdays.includes(weekdayIdx(date)));

/**
 * 고정 세부 영역의 그날 할 일을 만든다 (오늘부터 일주일 안의 날짜만 — 지난날은 만들지 않음).
 * id가 날짜로 정해져서 여러 번·여러 기기에서 불러도 하나만 생기고, 지운 날은 다시 생기지 않는다.
 */
export function ensureRoutineTasks(date: string) {
  const today = todayKey();
  if (date < today || date > addDays(today, 7)) return;
  const d = data();
  const rows: Omit<Task, 'updated_at'>[] = [];
  for (const sa of Object.values(d.subareas)) {
    if (sa.mode !== 'fixed' || !subareaDue(sa, date)) continue;
    const p = d.projects[sa.project_id];
    if (!p || p.deleted || p.done) continue;
    const id = routineTaskId(sa.id, date);
    if (d.tasks[id]) continue;
    rows.push({
      id, title: sa.fixed_title || sa.name, project_id: sa.project_id, area_id: '', subarea_id: sa.id, routine: true,
      date, due: date, time: sa.time, estimate: sa.estimate, important: false, done: false, done_on: '', sort: sa.sort, deleted: false,
    });
  }
  putRows('tasks', rows);
}

/** "오늘 뭐 할까?"에서 고르거나 적은 것 → 그 세부 영역의 그날 할 일 */
export function chooseForSubarea(sa: Subarea, title: string, date: string, estimate = 0) {
  putRows('tasks', [
    {
      id: uid(), title: title.trim(), project_id: sa.project_id, area_id: '', subarea_id: sa.id, routine: true,
      date, due: date, time: '', estimate: estimate || sa.estimate, important: false, done: false, done_on: '', sort: Date.now(),
    },
  ]);
}

export function toggleSkip(sa: Subarea, date: string) {
  const skips = sa.skips ?? [];
  const next = skips.includes(date) ? skips.filter((x) => x !== date) : [...skips, date];
  updateSubarea(sa.id, { skips: next.sort().slice(-120) }); // 오래된 건 버린다
}

/** 그 세부 영역에서 예전에 했던 것: 자주 한 순서 → 최근 순, 예상 시간은 마지막 값 */
export function subareaSuggestions(sa: Subarea, limit = 6) {
  const by = new Map<string, { title: string; n: number; last: string; estimate: number }>();
  for (const t of Object.values(data().tasks)) {
    if (t.deleted || t.subarea_id !== sa.id || !t.title.trim()) continue;
    const k = t.title.trim();
    const cur = by.get(k) ?? { title: k, n: 0, last: '', estimate: 0 };
    cur.n++;
    if (t.date >= cur.last) {
      cur.last = t.date;
      cur.estimate = t.estimate;
    }
    by.set(k, cur);
  }
  return [...by.values()].sort((a, b) => b.n - a.n || b.last.localeCompare(a.last)).slice(0, limit);
}

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

/** 이번 주부터 적용되는 주간 목표로 바꾼 목록. 이전 목표는 기록으로 남는다 */
function withTarget(targets: Target[] | undefined, hours: number) {
  const from = weekStart(todayKey());
  const next = (targets ?? []).filter((t) => t.from !== from);
  next.push({ from, hours });
  return next.sort((a, b) => a.from.localeCompare(b.from));
}

/** 꾸준히 주간 목표 변경 */
export const setTarget = (p: Project, hours: number) => updateProject(p.id, { targets: withTarget(p.targets, hours) });

/** 범주 주간 목표 변경 (예: 운동 주 4h) */
export const setAreaTarget = (a: Area, hours: number) => updateArea(a.id, { targets: withTarget(a.targets, hours) });

/** 꾸준히·프로젝트 이름과 똑같은 범주 (예: 꾸준히 "운동" ↔ 범주 "운동") */
export const sameNamedArea = (p: Project) =>
  Object.values(data().areas).find((a) => !a.deleted && a.name.trim() === p.title.trim());

/**
 * 이름이 같은 범주로 합치기: 이 꾸준히(프로젝트)의 할 일·기록·시간표 계획을 범주로 옮기고 꾸준히는 지운다.
 * 주간 목표는 범주에 목표가 없을 때만 그대로 옮긴다.
 */
export function mergeIntoArea(p: Project, a: Area) {
  const d = data();
  putRows(
    'tasks',
    Object.values(d.tasks)
      .filter((t) => !t.deleted && t.project_id === p.id)
      .map((t) => ({ ...t, project_id: '', area_id: a.id })),
  );
  putRows(
    'sessions',
    Object.values(d.sessions)
      .filter((s) => !s.deleted && s.project_id === p.id)
      .map((s) => ({ ...s, project_id: '', area_id: a.id, title: s.title === p.title ? '' : s.title })),
  );
  putRows(
    'plan_slots',
    Object.values(d.plan_slots)
      .filter((s) => !s.deleted && s.project_id === p.id)
      .map((s) => ({ ...s, project_id: '' })),
  );
  putRows(
    'habits',
    Object.values(d.habits)
      .filter((h) => !h.deleted && h.project_id === p.id)
      .map((h) => ({ ...h, project_id: '', area_id: a.id })),
  );
  if ((p.targets ?? []).length && !(a.targets ?? []).length) updateArea(a.id, { targets: p.targets });
  deleteProject(p.id);
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
  startTimer({ task_id: t.id, project_id: t.project_id, area_id: taskArea(t), title: t.title });
}
export const timerForProject = (p: Project) => startTimer({ project_id: p.id, area_id: p.area_id, title: p.title });
export const timerForHabit = (h: Habit) =>
  startTimer({ habit_id: h.id, project_id: h.project_id ?? '', area_id: h.area_id, title: h.title });

// ---------- 시간표 ----------

/** 시간표에 넣을 "일": 할 일 / 습관 / 꾸준히(프로젝트) */
export type PlanTarget = { task_id: string; habit_id: string; project_id: string; title: string };

export const planSlotId = (date: string, slot: number) => `${date}_${slot}`;
export const sameTarget = (a: PlanTarget, b: PlanTarget) =>
  a.task_id === b.task_id && a.habit_id === b.habit_id && a.project_id === b.project_id && (a.task_id || a.habit_id || a.project_id ? true : a.title === b.title);

/** 계획 칸 채우기. target이 null이면 비우기 */
export function setPlanSlots(date: string, slots: number[], target: PlanTarget | null) {
  const cur = data().plan_slots;
  const rows: Omit<PlanSlot, 'updated_at'>[] = [];
  for (const slot of slots) {
    if (slot < 0 || slot > 47) continue;
    const id = planSlotId(date, slot);
    const c = cur[id];
    const alive = c && !c.deleted;
    if (target === null) {
      if (alive) rows.push({ ...c, deleted: true });
    } else if (!alive || !sameTarget(c, target)) {
      rows.push({ id, date, slot, ...target, deleted: false });
    }
  }
  putRows('plan_slots', rows);
}

/** 범주 찾기: 할 일 → 그 프로젝트의 범주, 습관 → 습관의 범주, 꾸준히 → 그 범주 */
export function areaOfTarget(t: PlanTarget) {
  const d = data();
  if (t.habit_id) return d.habits[t.habit_id]?.area_id ?? '';
  if (t.task_id && d.tasks[t.task_id]) return taskArea(d.tasks[t.task_id]);
  return d.projects[t.project_id]?.area_id ?? '';
}

/**
 * 실제 칸을 직접 채우기(깜빡한 기록) → 타이머 기록(세션)으로 남긴다.
 *  - 이미 기록이 있는 시간은 건너뛴다 → 같은 칸을 여러 번 눌러도 시간이 쌓이지 않는다
 *  - 바로 앞뒤에 같은 일의 기록이 붙어 있으면 그 기록을 늘려 하나로 잇는다
 * 새로 채운 게 있으면 true
 */
export function fillActual(date: string, fromSlot: number, toSlot: number, target: PlanTarget) {
  return fillRange(
    Date.parse(atTime(date, slotTime(Math.min(fromSlot, toSlot)))),
    Date.parse(atTime(date, slotTime(Math.max(fromSlot, toSlot) + 1))),
    target,
  );
}

/** 분 단위 기록 추가(오늘 기록의 "깜빡한 기록 추가")도 같은 규칙으로 */
export function fillRange(start: number, end: number, target: PlanTarget) {
  if (end <= start) return false;
  const now = Date.now();
  const busy = Object.values(data().sessions)
    .filter((s) => !s.deleted)
    .map((s) => [Date.parse(s.start), s.end ? Date.parse(s.end) : now] as const)
    .filter(([a, b]) => b > start && a < end)
    .sort((x, y) => x[0] - y[0]);
  const gaps: [number, number][] = [];
  let cur = start;
  for (const [a, b] of busy) {
    if (a > cur) gaps.push([cur, Math.min(a, end)]);
    cur = Math.max(cur, b);
    if (cur >= end) break;
  }
  if (cur < end) gaps.push([cur, end]);

  const same = (s: Session) =>
    !s.deleted && !!s.end && s.task_id === target.task_id && s.habit_id === target.habit_id && s.project_id === target.project_id;
  for (const [a, b] of gaps) {
    const sIso = new Date(a).toISOString();
    const eIso = new Date(b).toISOString();
    const list = Object.values(data().sessions);
    const prev = list.find((s) => same(s) && s.end === sIso);
    const next = list.find((s) => same(s) && s.start === eIso);
    if (prev && next) {
      updateSession(prev.id, { end: next.end });
      deleteSession(next.id);
    } else if (prev) updateSession(prev.id, { end: eIso });
    else if (next) updateSession(next.id, { start: sIso });
    else addSession({ ...target, area_id: areaOfTarget(target), start: sIso, end: eIso });
  }
  return gaps.length > 0;
}

const slotTime = (slot: number) => (slot >= 48 ? '24:00' : `${String(Math.floor(slot / 2)).padStart(2, '0')}:${slot % 2 ? '30' : '00'}`);

// ---------- 버킷리스트 ----------

export function addBucket(title: string, minutes: number, area_id: string, kind: BucketKind = 'bucket', note = '') {
  putRows('bucket_items', [{ id: uid(), kind, note, title, minutes, area_id, done: false, done_on: '', sort: Date.now() }]);
}

/** 하고 싶은 것 → 프로젝트·꾸준히로 올리기. 메모는 그대로 옮기고, 원래 항목은 "올림"으로 끝낸다 */
export function promoteIdea(b: BucketItem, kind: ProjectKind) {
  const id = addProject(b.title, b.area_id || dailyId(), kind);
  if (b.note) updateProject(id, { note: b.note });
  updateBucket(b.id, { done: true, done_on: todayKey() });
  return id;
}

export const updateBucket = (id: string, patch: Partial<BucketItem>) => patchRow('bucket_items', id, patch);
export const deleteBucket = (id: string) => patchRow('bucket_items', id, { deleted: true });

export const toggleBucket = (b: BucketItem) =>
  updateBucket(b.id, b.done ? { done: false, done_on: '' } : { done: true, done_on: todayKey() });

/** 버킷리스트 항목을 오늘 할 일(일회성)로 넣는다 */
export const bucketToToday = (b: BucketItem) =>
  putRows('tasks', [
    {
      id: uid(), title: b.title, project_id: '', area_id: b.area_id || dailyId(), date: todayKey(), due: todayKey(),
      time: '', estimate: b.minutes, important: false, done: false, done_on: '', sort: Date.now(),
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

/** 범주 추가 — 개수 제한 없음 (설정 화면에서 9개 넘으면 권장 안내만) */
export function addArea(name: string, color: string) {
  const alive = Object.values(data().areas).filter((a) => !a.deleted);
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
