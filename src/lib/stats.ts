import { addDays, weekdayIdx } from './date';
import { blockId, logId } from './ids';
import type { Habit, Tables } from './types';

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

export type DayBlocks = {
  plan: Record<string, number>;
  actual: Record<string, number>;
  planTotal: number;
  actualTotal: number;
  matched: number; // 계획한 영역 그대로 실행한 칸 수
  focus: number; // 낭비가 아닌 실제 칸 수
};

const emptyDay = (): DayBlocks => ({ plan: {}, actual: {}, planTotal: 0, actualTotal: 0, matched: 0, focus: 0 });

export function dayBlocks(blocks: Tables['time_blocks'], areas: Tables['areas'], date: string): DayBlocks {
  const r = emptyDay();
  for (let s = 0; s < 48; s++) {
    const p = blocks[blockId(date, 'plan', s)];
    const a = blocks[blockId(date, 'actual', s)];
    const pa = p && !p.deleted ? p.area_id : null;
    const aa = a && !a.deleted ? a.area_id : null;
    if (pa) {
      r.plan[pa] = (r.plan[pa] ?? 0) + 1;
      r.planTotal++;
    }
    if (aa) {
      r.actual[aa] = (r.actual[aa] ?? 0) + 1;
      r.actualTotal++;
      if (!areas[aa]?.is_waste) r.focus++;
    }
    if (pa && pa === aa) r.matched++;
  }
  return r;
}

export function sumBlocks(days: DayBlocks[]): DayBlocks {
  const r = emptyDay();
  for (const d of days) {
    for (const [k, v] of Object.entries(d.plan)) r.plan[k] = (r.plan[k] ?? 0) + v;
    for (const [k, v] of Object.entries(d.actual)) r.actual[k] = (r.actual[k] ?? 0) + v;
    r.planTotal += d.planTotal;
    r.actualTotal += d.actualTotal;
    r.matched += d.matched;
    r.focus += d.focus;
  }
  return r;
}

export const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
