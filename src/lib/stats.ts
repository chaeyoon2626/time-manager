import { addDays, weekdayIdx } from './date';
import { logId } from './ids';
import type { Habit, Project, Session, Tables, Task } from './types';

export const isScheduled = (h: Habit, date: string) => h.weekdays.length === 0 || h.weekdays.includes(weekdayIdx(date));

/** 오늘 아직 안 했으면 어제부터 거꾸로 센다. 쉬는 요일은 끊김으로 치지 않는다. */
export function streak(h: Habit, logs: Set<string>, asOf: string) {
  let k = logs.has(logId(h.id, asOf)) ? asOf : addDays(asOf, -1);
  let n = 0;
  for (let i = 0; i < 800; i++) {
    const done = logs.has(logId(h.id, k));
    if (done) n++;
    else if (k < h.created_on || isScheduled(h, k)) break;
    k = addDays(k, -1);
  }
  return n;
}

export const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

// ---------- 타이머 기록 ----------

/** 기록이 [from, to) 구간과 겹치는 분. 진행 중인 기록은 now까지로 친다 */
export function overlapMin(s: Session, from: number, to: number, now: number) {
  const a = Math.max(Date.parse(s.start), from);
  const b = Math.min(s.end ? Date.parse(s.end) : now, to);
  return b > a ? (b - a) / 60_000 : 0;
}

export type SessionSum = { total: number; byArea: Record<string, number>; byProject: Record<string, number> };

export function sumSessions(sessions: Session[], from: number, to: number, now: number): SessionSum {
  const r: SessionSum = { total: 0, byArea: {}, byProject: {} };
  for (const s of sessions) {
    const m = overlapMin(s, from, to, now);
    if (!m) continue;
    r.total += m;
    const area = s.area_id || '';
    r.byArea[area] = (r.byArea[area] ?? 0) + m;
    if (s.project_id) r.byProject[s.project_id] = (r.byProject[s.project_id] ?? 0) + m;
  }
  return r;
}

// ---------- 할 일 ----------

/** 할 일 자체 마감 → 없으면 프로젝트 마감 */
export const effectiveDue = (t: Task, projects: Tables['projects']) => t.due || projects[t.project_id]?.due || '';

/** 그 주(월요일 key)에 적용되는 꾸준히 목표 시간. 그 주 이전에 정한 목표가 없으면 0 */
export function targetFor(p: Project, weekKey: string) {
  let h = 0;
  for (const t of p.targets ?? []) if (t.from <= weekKey) h = t.hours;
  return h;
}
