import { useEffect, useMemo, useRef, useState } from 'react';
import { Eraser } from 'lucide-react';
import { fillActual, planSlotId, sameTarget, setPlanSlots, type PlanTarget } from '../actions';
import { useAreaMap, useNow, useProjectMap, useSessions } from '../hooks';
import { dayBounds, fmtDur, slotLabel, toKey } from '../lib/date';
import { overlapMin, pct } from '../lib/stats';
import type { Habit, Project, Session, Task } from '../lib/types';
import { useStore } from '../store';
import { Card, cn } from './ui';

const ROW = 26; // 30분 한 칸 높이(px)
const HOLD_MS = 280;
const MOVE_TOLERANCE = 8;
const NONE = '#a1a1aa';

type Col = 'plan' | 'actual';
type Item = { key: string; target: PlanTarget; estimate: number; color: string; label: string };
type Drag = { col: Col; anchor: number; last: number; moved: boolean };
type Pending = { col: Col; slot: number; x: number; y: number; timer: ReturnType<typeof setTimeout> };

const keyOf = (t: { task_id: string; habit_id: string; project_id: string; title: string }) =>
  t.task_id ? `t:${t.task_id}` : t.habit_id ? `h:${t.habit_id}` : t.project_id ? `p:${t.project_id}` : `x:${t.title}`;

/**
 * 시간표: 왼쪽 "계획"(오늘 할 일을 골라 붙이기), 오른쪽 "실제"(타이머 기록이 분 단위로 그려짐).
 * 탭 = 예상 시간만큼 붙이기 / 꾹(폰)·끌기(PC) = 원하는 만큼 / 같은 일 다시 탭 = 그 덩어리 지우기
 */
export function Timetable({ date, tasks, habits, steady }: { date: string; tasks: Task[]; habits: Habit[]; steady: Project[] }) {
  const areas = useAreaMap();
  const projects = useProjectMap();
  const plan = useStore((s) => s.data.plan_slots);
  const habitsRec = useStore((s) => s.data.habits);
  const tasksRec = useStore((s) => s.data.tasks);
  const sessions = useSessions();
  const now = useNow();
  const { startHour, endHour } = useStore((s) => s.settings);
  const [brushKey, setBrushKey] = useState<string | null>(null); // Item.key 또는 'erase'
  const [sel, setSel] = useState<{ col: Col; from: number; to: number } | null>(null);

  // 넣을 수 있는 일: ① 오늘 할 일 → 꾸준히 → 습관
  const items: Item[] = useMemo(() => {
    const colorOfProject = (pid: string) => areas[projects[pid]?.area_id]?.color ?? NONE;
    return [
      ...tasks.map((t) => ({
        key: `t:${t.id}`,
        target: { task_id: t.id, habit_id: '', project_id: t.project_id, title: t.title },
        estimate: t.estimate,
        color: colorOfProject(t.project_id),
        label: t.title,
      })),
      ...steady.map((p) => ({
        key: `p:${p.id}`,
        target: { task_id: '', habit_id: '', project_id: p.id, title: p.title },
        estimate: 0,
        color: areas[p.area_id]?.color ?? NONE,
        label: p.title,
      })),
      ...habits.map((h) => ({
        key: `h:${h.id}`,
        target: { task_id: '', habit_id: h.id, project_id: '', title: h.title },
        estimate: 0,
        color: areas[h.area_id]?.color ?? NONE,
        label: h.title,
      })),
    ];
  }, [tasks, steady, habits, areas, projects]);

  const brush = items.find((i) => i.key === brushKey) ?? null;
  const erasing = brushKey === 'erase';

  // 드래그 중 최신값을 읽으려고 ref로
  const ref = useRef({ brush, erasing, date, plan });
  ref.current = { brush, erasing, date, plan };
  const drag = useRef<Drag | null>(null);
  const pending = useRef<Pending | null>(null);

  const planAt = (slot: number) => {
    const p = ref.current.plan[planSlotId(ref.current.date, slot)];
    return p && !p.deleted ? p : null;
  };

  /** 탭(움직이지 않고 뗌) */
  const tap = (col: Col, slot: number) => {
    const { brush, erasing, date } = ref.current;
    if (col === 'actual') {
      if (brush) fillActual(date, slot, slot, brush.target);
      return;
    }
    const cur = planAt(slot);
    if (erasing || (brush && cur && sameTarget(cur, brush.target))) {
      // 그 칸이 속한 덩어리 전체를 지운다
      if (!cur) return;
      const run = [slot];
      for (let s = slot - 1; planAt(s) && sameTarget(planAt(s)!, cur); s--) run.push(s);
      for (let s = slot + 1; planAt(s) && sameTarget(planAt(s)!, cur); s++) run.push(s);
      setPlanSlots(date, run, null);
    } else if (brush) {
      const n = Math.max(1, Math.ceil(brush.estimate / 30));
      setPlanSlots(date, Array.from({ length: n }, (_, i) => slot + i), brush.target);
    }
  };

  /** 끌어서 고른 범위 적용 */
  const applyRange = (col: Col, a: number, b: number) => {
    const { brush, erasing, date } = ref.current;
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    const range = Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
    if (col === 'actual') {
      if (brush) fillActual(date, lo, hi, brush.target);
    } else if (erasing) setPlanSlots(date, range, null);
    else if (brush) setPlanSlots(date, range, brush.target);
  };

  const begin = (col: Col, slot: number) => {
    drag.current = { col, anchor: slot, last: slot, moved: false };
  };

  const cancelPending = () => {
    if (pending.current) clearTimeout(pending.current.timer);
    pending.current = null;
  };

  useEffect(() => {
    const move = (e: PointerEvent) => {
      const p = pending.current;
      if (p && Math.hypot(e.clientX - p.x, e.clientY - p.y) > MOVE_TOLERANCE) cancelPending(); // 스크롤이었다
      const d = drag.current;
      if (!d) return;
      const el = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('[data-tt-slot]');
      if (!el || el.dataset.ttCol !== d.col) return;
      const s = Number(el.dataset.ttSlot);
      if (s === d.last) return;
      d.last = s;
      d.moved = true;
      setSel({ col: d.col, from: d.anchor, to: s });
    };
    const up = () => {
      const p = pending.current;
      if (p) {
        cancelPending();
        tap(p.col, p.slot); // 꾹 누르기 전에 뗐다 = 탭
      }
      const d = drag.current;
      if (d) {
        if (d.moved) applyRange(d.col, d.anchor, d.last);
        else if (!p) tap(d.col, d.anchor);
      }
      drag.current = null;
      setSel(null);
    };
    const cancel = () => {
      cancelPending();
      drag.current = null;
      setSel(null);
    };
    const blockScroll = (e: TouchEvent) => drag.current && e.cancelable && e.preventDefault();
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    document.addEventListener('touchmove', blockScroll, { passive: false });
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      document.removeEventListener('touchmove', blockScroll);
    };
    // tap/applyRange는 ref만 읽으므로 한 번만 등록
  }, []);

  const onDown = (col: Col, slot: number) => (e: React.PointerEvent) => {
    if (!ref.current.brush && !ref.current.erasing) return;
    if (col === 'actual' && !ref.current.brush) return;
    if (e.pointerType !== 'touch') {
      e.preventDefault();
      return begin(col, slot);
    }
    // 터치: 꾹 누르면 범위 고르기, 그 전에 움직이면 스크롤, 그냥 떼면 탭
    const el = e.target as Element;
    if (el.hasPointerCapture?.(e.pointerId)) el.releasePointerCapture(e.pointerId);
    cancelPending();
    pending.current = {
      col,
      slot,
      x: e.clientX,
      y: e.clientY,
      timer: setTimeout(() => {
        pending.current = null;
        navigator.vibrate?.(8);
        begin(col, slot);
        setSel({ col, from: slot, to: slot });
      }, HOLD_MS),
    };
  };

  // ---------- 그리기 ----------

  const first = startHour * 2;
  const slots = Array.from({ length: endHour * 2 - first }, (_, i) => first + i);
  const [dayFrom, dayTo] = dayBounds(date);
  const viewFrom = dayFrom + startHour * 3_600_000;
  const daySessions = sessions.filter((s) => overlapMin(s, dayFrom, dayTo, now) > 0);
  const colorOf = (t: { task_id: string; habit_id: string; project_id: string }) => {
    if (t.habit_id) return areas[habitsRec[t.habit_id]?.area_id]?.color ?? NONE;
    return areas[projects[t.project_id]?.area_id]?.color ?? NONE;
  };
  const sessionColor = (s: Session) => areas[s.area_id]?.color ?? colorOf(s);
  const inSel = (col: Col, slot: number) => sel && sel.col === col && slot >= Math.min(sel.from, sel.to) && slot <= Math.max(sel.from, sel.to);

  const planCell = (slot: number) => {
    const p = plan[planSlotId(date, slot)];
    const cur = p && !p.deleted ? p : null;
    const prev = plan[planSlotId(date, slot - 1)];
    const next = plan[planSlotId(date, slot + 1)];
    const prevSame = !!cur && !!prev && !prev.deleted && sameTarget(prev, cur);
    const nextSame = !!cur && !!next && !next.deleted && sameTarget(next, cur);
    let runLen = 1;
    if (cur && !prevSame) for (let s = slot + 1; plan[planSlotId(date, s)] && !plan[planSlotId(date, s)].deleted && sameTarget(plan[planSlotId(date, s)], cur); s++) runLen++;
    const color = cur ? colorOf(cur) : NONE;
    const done = cur?.task_id ? tasksRec[cur.task_id]?.done : false;
    const selected = inSel('plan', slot);
    return (
      <div
        key={slot}
        data-tt-slot={slot}
        data-tt-col="plan"
        onPointerDown={onDown('plan', slot)}
        onContextMenu={(e) => e.preventDefault()}
        onDragOver={(e) => e.dataTransfer.types.includes('text/tt-item') && e.preventDefault()}
        onDrop={(e) => {
          const key = e.dataTransfer.getData('text/tt-item');
          const it = items.find((i) => i.key === key);
          if (!it) return;
          const n = Math.max(1, Math.ceil(it.estimate / 30));
          setPlanSlots(date, Array.from({ length: n }, (_, i) => slot + i), it.target);
        }}
        className={cn('touch-pan-y select-none [-webkit-touch-callout:none]', !prevSame && 'pt-px', !nextSame && 'pb-px')}
        style={{ height: ROW }}
      >
        <div
          className={cn(
            'h-full truncate px-1.5 text-[11px] font-semibold',
            !prevSame && 'rounded-t-md',
            !nextSame && 'rounded-b-md',
            !cur && !selected && 'bg-zinc-100 dark:bg-zinc-800/50',
            selected && 'ring-2 ring-inset',
            done && 'line-through opacity-60',
          )}
          style={{
            lineHeight: `${ROW - 2}px`,
            ...(cur ? { background: `${color}26`, boxShadow: `inset 3px 0 0 ${color}`, color } : {}),
            ...(selected ? { ['--tw-ring-color' as string]: erasing ? '#f43f5e' : (brush?.color ?? NONE), background: erasing ? '#fee2e2' : `${brush?.color ?? NONE}33` } : {}),
          }}
        >
          {cur && !prevSame && (
            <>
              {cur.title}
              <span className="ml-1 font-normal opacity-70">{fmtDur(runLen * 30)}</span>
            </>
          )}
        </div>
      </div>
    );
  };

  const isToday = date === toKey(new Date(now));
  const nowTop = ((now - viewFrom) / 60_000 / 30) * ROW;

  return (
    <Card title="시간표 · 계획 vs 실제" action={<Summary date={date} />}>
      {/* 붙일 일 고르기 */}
      <div className="sticky top-14 z-10 -mx-4 mb-3 border-b border-zinc-100 bg-white/95 px-4 pt-1 pb-3 backdrop-blur md:top-[56px] dark:border-zinc-800 dark:bg-zinc-900/95">
        {items.length === 0 ? (
          <p className="text-sm text-zinc-400">위 ①에 오늘 할 일을 먼저 적으면 여기서 골라 시간표에 붙일 수 있어요.</p>
        ) : (
          <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none] md:mx-0 md:flex-wrap md:overflow-visible md:px-0">
            {items.map((it) => (
              <button
                key={it.key}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('text/tt-item', it.key);
                  setBrushKey(it.key);
                }}
                onClick={() => setBrushKey(brushKey === it.key ? null : it.key)}
                className={cn(
                  'flex h-7 max-w-[220px] shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium whitespace-nowrap transition',
                  brushKey === it.key ? 'border-transparent text-white shadow-sm' : 'border-zinc-200 text-zinc-600 hover:border-zinc-300 dark:border-zinc-700 dark:text-zinc-300',
                )}
                style={brushKey === it.key ? { background: it.color } : undefined}
              >
                {brushKey !== it.key && <span className="size-2 shrink-0 rounded-full" style={{ background: it.color }} />}
                <span className="truncate">{it.label}</span>
                {it.estimate > 0 && <span className="opacity-70">{fmtDur(it.estimate)}</span>}
              </button>
            ))}
            <button
              onClick={() => setBrushKey(erasing ? null : 'erase')}
              className={cn(
                'flex h-7 shrink-0 items-center gap-1 rounded-full border px-2.5 text-xs font-medium whitespace-nowrap',
                erasing ? 'border-transparent bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900' : 'border-zinc-200 text-zinc-500 dark:border-zinc-700',
              )}
            >
              <Eraser className="size-3.5" /> 계획 지우기
            </button>
          </div>
        )}
        <p className="mt-2 line-clamp-2 text-[11px] text-zinc-400 md:line-clamp-none">
          {brush
            ? `'${brush.label}' — 계획 칸을 탭하면 ${brush.estimate ? `예상 ${fmtDur(brush.estimate)}만큼` : '30분'} 붙어요. 꾹 눌러(PC는 끌어서) 원하는 만큼. 실제 칸을 채우면 기록이 돼요.`
            : erasing
              ? '지울 계획 칸을 탭하거나 끌어서 지워요.'
              : '할 일을 하나 고른 뒤 아래 칸을 눌러요. PC에서는 끌어다 놓아도 돼요.'}
        </p>
        <div className="mt-3 grid grid-cols-[44px_1fr_1fr] gap-x-1.5 text-[11px] font-semibold text-zinc-400">
          <span />
          <span>계획</span>
          <span>실제 (타이머)</span>
        </div>
      </div>

      <div className="relative grid grid-cols-[44px_1fr_1fr] gap-x-1.5">
        <div>
          {slots.map((s) => (
            <div key={s} className="text-[10px] leading-none text-zinc-400 tabular-nums" style={{ height: ROW }}>
              {s % 2 === 0 ? slotLabel(s) : ''}
            </div>
          ))}
        </div>
        <div>{slots.map(planCell)}</div>
        <div className="relative">
          {slots.map((s) => (
            <div
              key={s}
              data-tt-slot={s}
              data-tt-col="actual"
              onPointerDown={onDown('actual', s)}
              onContextMenu={(e) => e.preventDefault()}
              className="touch-pan-y py-px select-none [-webkit-touch-callout:none]"
              style={{ height: ROW }}
            >
              <div
                className={cn('h-full rounded-md', inSel('actual', s) ? 'ring-2 ring-inset' : 'bg-zinc-50 dark:bg-zinc-800/30')}
                style={inSel('actual', s) ? { ['--tw-ring-color' as string]: brush?.color ?? NONE, background: `${brush?.color ?? NONE}33` } : undefined}
              />
            </div>
          ))}
          {daySessions.map((s) => {
            const a = Math.max(Date.parse(s.start), viewFrom);
            const b = Math.min(s.end ? Date.parse(s.end) : now, dayFrom + endHour * 3_600_000);
            if (b <= a) return null;
            const top = ((a - viewFrom) / 60_000 / 30) * ROW;
            const h = Math.max(((b - a) / 60_000 / 30) * ROW, 3);
            const p = projects[s.project_id];
            const name = s.title || p?.title || areas[s.area_id]?.name || '기록';
            return (
              <div
                key={s.id}
                title={`${name} ${fmtDur((b - a) / 60_000)}`}
                className={cn('pointer-events-none absolute inset-x-0 overflow-hidden rounded-md px-1.5 text-[11px] font-semibold text-white', !s.end && 'animate-pulse')}
                style={{ top, height: h, background: sessionColor(s), lineHeight: `${Math.min(h, ROW - 2)}px` }}
              >
                {h >= 14 && (
                  <>
                    {name}
                    <span className="ml-1 font-normal opacity-80">{fmtDur((b - a) / 60_000)}</span>
                  </>
                )}
              </div>
            );
          })}
        </div>
        {isToday && nowTop >= 0 && nowTop <= slots.length * ROW && (
          <div className="pointer-events-none absolute right-0 left-[42px] z-[1] flex items-center" style={{ top: nowTop }}>
            <span className="size-1.5 rounded-full bg-rose-500" />
            <span className="h-px flex-1 bg-rose-500" />
          </div>
        )}
      </div>

      <Comparison date={date} />
    </Card>
  );
}

// ---------- 계획 vs 실제 ----------

function useComparison(date: string) {
  const plan = useStore((s) => s.data.plan_slots);
  const habits = useStore((s) => s.data.habits);
  const sessions = useSessions();
  const projects = useProjectMap();
  const areas = useAreaMap();
  const now = useNow();
  return useMemo(() => {
    const [from, to] = dayBounds(date);
    const daySlots = Object.values(plan).filter((p) => !p.deleted && p.date === date);
    const daySessions = sessions.filter((s) => overlapMin(s, from, to, now) > 0);
    const rows = new Map<string, { title: string; color: string; plan: number; actual: number }>();
    const colorFor = (t: { habit_id: string; project_id: string; area_id?: string }) =>
      areas[t.area_id ?? '']?.color ?? (t.habit_id ? areas[habits[t.habit_id]?.area_id]?.color : areas[projects[t.project_id]?.area_id]?.color) ?? NONE;
    const row = (key: string, title: string, color: string) => {
      if (!rows.has(key)) rows.set(key, { title, color, plan: 0, actual: 0 });
      return rows.get(key)!;
    };
    let matched = 0;
    for (const p of daySlots) {
      row(keyOf(p), p.title, colorFor(p)).plan += 30;
      // 그 30분 칸에 같은 일을 15분 이상 했으면 "계획대로"
      const a = from + p.slot * 1_800_000;
      const done = daySessions.filter((s) => keyOf(s) === keyOf(p)).reduce((n, s) => n + overlapMin(s, a, a + 1_800_000, now), 0);
      if (done >= 15) matched++;
    }
    for (const s of daySessions) {
      const name = s.title || projects[s.project_id]?.title || areas[s.area_id]?.name || '기록';
      row(keyOf(s), name, colorFor(s)).actual += overlapMin(s, from, to, now);
    }
    const list = [...rows.values()].sort((x, y) => Math.max(y.plan, y.actual) - Math.max(x.plan, x.actual));
    const planTotal = daySlots.length * 30;
    const actualTotal = list.reduce((n, r) => n + r.actual, 0);
    return { list, planTotal, actualTotal, matchedPct: pct(matched, daySlots.length) };
  }, [plan, habits, sessions, projects, areas, date, now]);
}

function Summary({ date }: { date: string }) {
  const c = useComparison(date);
  return (
    <span className="text-xs text-zinc-400 tabular-nums">
      계획 <b className="font-semibold text-zinc-700 dark:text-zinc-200">{fmtDur(c.planTotal)}</b> · 실제{' '}
      <b className="font-semibold text-zinc-700 dark:text-zinc-200">{fmtDur(c.actualTotal)}</b>
    </span>
  );
}

function Comparison({ date }: { date: string }) {
  const c = useComparison(date);
  if (!c.list.length) return null;
  const max = Math.max(...c.list.map((r) => Math.max(r.plan, r.actual)), 30);
  return (
    <div className="mt-5 border-t border-zinc-100 pt-4 dark:border-zinc-800">
      <div className="mb-3 flex items-baseline gap-2">
        <h3 className="text-sm font-bold">일별 계획 vs 실제</h3>
        {c.planTotal > 0 && (
          <span className="ml-auto text-xs text-zinc-500">
            계획대로 실행 <b className="text-sm font-bold text-zinc-800 tabular-nums dark:text-zinc-100">{c.matchedPct}%</b>
          </span>
        )}
      </div>
      <ul className="space-y-2.5">
        {c.list.map((r) => {
          const diff = r.actual - r.plan;
          return (
            <li key={r.title + r.color} className="text-sm">
              <div className="mb-1 flex items-baseline gap-2">
                <span className="size-2 shrink-0 rounded-full" style={{ background: r.color }} />
                <span className="min-w-0 flex-1 truncate">{r.title}</span>
                <span className="shrink-0 text-xs text-zinc-400 tabular-nums">
                  계획 {r.plan ? fmtDur(r.plan) : '–'} · 실제 <b className="font-semibold text-zinc-700 dark:text-zinc-200">{r.actual ? fmtDur(r.actual) : '–'}</b>
                </span>
                {r.plan > 0 && Math.abs(diff) >= 5 && (
                  <span className={cn('w-14 shrink-0 text-right text-xs font-semibold tabular-nums', diff > 0 ? 'text-orange-500' : 'text-sky-600')}>
                    {diff > 0 ? '+' : '−'}
                    {fmtDur(Math.abs(diff))}
                  </span>
                )}
              </div>
              <div className="relative h-1.5 rounded-full bg-zinc-100 dark:bg-zinc-800">
                <div className="absolute inset-y-0 left-0 rounded-full opacity-30" style={{ width: `${(r.plan / max) * 100}%`, background: r.color }} />
                <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${(r.actual / max) * 100}%`, background: r.color }} />
              </div>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-[11px] text-zinc-400">옅은 막대 = 계획, 진한 막대 = 실제 · +는 계획보다 더 씀, −는 덜 씀</p>
    </div>
  );
}
