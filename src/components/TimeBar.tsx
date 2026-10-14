import { useEffect, useRef, useState } from 'react';
import { CopyCheck, Eraser } from 'lucide-react';
import { copyPlanToActual, setBlocks } from '../actions';
import { useAreaMap, useAreas, useNow } from '../hooks';
import { hours, slotLabel, toKey } from '../lib/date';
import { blockId } from '../lib/ids';
import { dayBlocks, pct } from '../lib/stats';
import type { BlockKind } from '../lib/types';
import { useStore } from '../store';
import { Button, Card, cn } from './ui';

const ROW = 24; // 30분 한 칸의 높이(px)
const ERASE = '__erase__';

type Drag = { kind: BlockKind; mode: 'paint' | 'erase'; last: number; done: Set<number> };
/** 터치: 꾹 누르기 전까지는 스크롤일 수도 있어서 대기 */
type Pending = { kind: BlockKind; slot: number; x: number; y: number; timer: ReturnType<typeof setTimeout> };

const HOLD_MS = 280;
const MOVE_TOLERANCE = 8;

export function TimeBar({ date }: { date: string }) {
  const areas = useAreas();
  const areaMap = useAreaMap();
  const blocks = useStore((s) => s.data.time_blocks);
  const { startHour, endHour } = useStore((s) => s.settings);
  const now = useNow();
  const [brush, setBrush] = useState(areas[0]?.id ?? 'career');

  // 드래그 중에는 렌더 사이에 값이 바뀌어도 최신값을 읽도록 ref로 들고 있는다
  const brushRef = useRef(brush);
  const dateRef = useRef(date);
  brushRef.current = brush;
  dateRef.current = date;
  const drag = useRef<Drag | null>(null);
  const pending = useRef<Pending | null>(null);
  const blocksRef = useRef(blocks);
  blocksRef.current = blocks;

  const areaAtNow = (kind: BlockKind, slot: number) => {
    const b = blocksRef.current[blockId(dateRef.current, kind, slot)];
    return b && !b.deleted ? b.area_id : null;
  };

  const start = (kind: BlockKind, slot: number) => {
    const b = brushRef.current;
    const mode = b === ERASE || areaAtNow(kind, slot) === b ? 'erase' : 'paint';
    drag.current = { kind, mode, last: slot, done: new Set() };
    paint(slot, slot);
  };

  const cancelPending = () => {
    if (pending.current) clearTimeout(pending.current.timer);
    pending.current = null;
  };

  const paint = (from: number, to: number) => {
    const d = drag.current;
    if (!d) return;
    const list: number[] = [];
    for (let s = Math.min(from, to); s <= Math.max(from, to); s++) {
      if (!d.done.has(s)) {
        d.done.add(s);
        list.push(s);
      }
    }
    setBlocks(dateRef.current, d.kind, list, d.mode === 'erase' ? null : brushRef.current);
  };

  useEffect(() => {
    const move = (e: PointerEvent) => {
      const p = pending.current;
      if (p && Math.hypot(e.clientX - p.x, e.clientY - p.y) > MOVE_TOLERANCE) cancelPending(); // 스크롤이었다
      const d = drag.current;
      if (!d) return;
      const el = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('[data-slot]');
      if (!el || el.dataset.kind !== d.kind) return;
      const s = Number(el.dataset.slot);
      if (s === d.last) return;
      paint(d.last, s); // 빠르게 움직여 건너뛴 칸까지 채운다
      d.last = s;
    };
    const up = () => {
      const p = pending.current;
      if (p) {
        // 꾹 누르기 전에 뗐다 = 탭 → 한 칸만
        cancelPending();
        start(p.kind, p.slot);
      }
      drag.current = null;
    };
    const cancel = () => {
      cancelPending();
      drag.current = null;
    };
    // 칠하는 중에는 페이지가 같이 스크롤되지 않게 막는다
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
    // paint는 ref만 읽으므로 한 번만 등록해도 된다
  }, []);

  const areaAt = (kind: BlockKind, slot: number) => {
    const b = blocks[blockId(date, kind, slot)];
    return b && !b.deleted ? b.area_id : null;
  };

  const onDown = (kind: BlockKind, slot: number) => (e: React.PointerEvent) => {
    if (e.pointerType !== 'touch') {
      e.preventDefault();
      return start(kind, slot);
    }
    // 터치: 꾹 누르면 드래그로 칠하기, 그 전에 움직이면 스크롤
    // (터치는 누른 요소에 포인터가 묶이므로 놓아줘야 다른 칸 위의 움직임을 받을 수 있다)
    const el = e.target as Element;
    if (el.hasPointerCapture?.(e.pointerId)) el.releasePointerCapture(e.pointerId);
    cancelPending();
    pending.current = {
      kind,
      slot,
      x: e.clientX,
      y: e.clientY,
      timer: setTimeout(() => {
        pending.current = null;
        navigator.vibrate?.(8);
        start(kind, slot);
      }, HOLD_MS),
    };
  };

  const first = startHour * 2;
  const slots = Array.from({ length: endHour * 2 - first }, (_, i) => first + i);
  const stats = dayBlocks(blocks, areaMap, date);
  const isToday = date === toKey(now);
  const nowTop = ((now.getHours() * 60 + now.getMinutes()) / 30 - first) * ROW;

  const column = (kind: BlockKind, slot: number) => {
    const a = areaAt(kind, slot);
    const prevSame = a !== null && areaAt(kind, slot - 1) === a;
    const nextSame = a !== null && areaAt(kind, slot + 1) === a;
    const area = a ? areaMap[a] : undefined;
    const color = area?.color ?? '#a1a1aa';
    return (
      <div
        data-slot={slot}
        data-kind={kind}
        onPointerDown={onDown(kind, slot)}
        onContextMenu={(e) => e.preventDefault()}
        className={cn('h-6 touch-pan-y select-none [-webkit-touch-callout:none]', !prevSame && 'pt-px', !nextSame && 'pb-px')}
      >
        <div
          className={cn(
            'h-full truncate px-1.5 text-[11px] leading-[22px] font-semibold',
            !prevSame && 'rounded-t-md',
            !nextSame && 'rounded-b-md',
            !a && 'bg-zinc-100 hover:bg-zinc-200/80 dark:bg-zinc-800/50 dark:hover:bg-zinc-800',
            a && kind === 'actual' && 'text-white',
          )}
          style={
            a
              ? kind === 'actual'
                ? { background: color }
                : { background: `${color}24`, boxShadow: `inset 3px 0 0 ${color}`, color }
              : undefined
          }
        >
          {a && !prevSame && area?.name}
        </div>
      </div>
    );
  };

  return (
    <Card
      title="타임바"
      className="lg:max-h-[calc(100dvh-96px)] lg:overflow-y-auto"
      action={
        stats.planTotal > 0 && (
          <Button variant="outline" onClick={() => copyPlanToActual(date)} title="실제 칸이 빈 곳을 계획대로 채워요">
            <CopyCheck className="size-3.5" /> 계획대로 했음
          </Button>
        )
      }
    >
      <div className="sticky -top-4 z-10 -mx-4 mb-3 bg-white/95 px-4 pt-1 pb-2 backdrop-blur dark:bg-zinc-900/95">
        <div className="flex flex-wrap gap-1.5">
          {areas.map((a) => (
            <button
              key={a.id}
              onClick={() => setBrush(a.id)}
              className={cn(
                'flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition',
                brush === a.id
                  ? 'border-transparent text-white shadow-sm'
                  : 'border-zinc-200 text-zinc-600 hover:border-zinc-300 dark:border-zinc-700 dark:text-zinc-300',
              )}
              style={brush === a.id ? { background: a.color } : undefined}
            >
              {brush !== a.id && <span className="size-2 rounded-full" style={{ background: a.color }} />}
              {a.name}
            </button>
          ))}
          <button
            onClick={() => setBrush(ERASE)}
            aria-label="지우개"
            className={cn(
              'flex h-7 items-center gap-1 rounded-full border px-2.5 text-xs font-medium transition',
              brush === ERASE
                ? 'border-transparent bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                : 'border-zinc-200 text-zinc-500 dark:border-zinc-700',
            )}
          >
            <Eraser className="size-3.5" /> 지우기
          </button>
        </div>
        <div className="mt-3 grid grid-cols-[40px_1fr_1fr] gap-x-1.5 text-[11px] font-semibold text-zinc-400">
          <span />
          <span>
            계획 <span className="font-normal tabular-nums">{hours(stats.planTotal)}</span>
          </span>
          <span>
            실제 <span className="font-normal tabular-nums">{hours(stats.actualTotal)}</span>
          </span>
        </div>
      </div>

      <div className="relative">
        {slots.map((slot) => (
          <div key={slot} className="grid grid-cols-[40px_1fr_1fr] gap-x-1.5">
            <div className="text-[10px] leading-none text-zinc-400 tabular-nums">
              {slot % 2 === 0 ? slotLabel(slot) : ''}
            </div>
            {column('plan', slot)}
            {column('actual', slot)}
          </div>
        ))}
        {isToday && nowTop >= 0 && nowTop <= slots.length * ROW && (
          <div className="pointer-events-none absolute right-0 left-[38px] flex items-center" style={{ top: nowTop }}>
            <span className="size-1.5 rounded-full bg-rose-500" />
            <span className="h-px flex-1 bg-rose-500" />
          </div>
        )}
      </div>
      <p className="mt-2 text-[11px] text-zinc-400">
        영역을 고르고 칸을 누르면 칠해져요. 여러 칸은 끌어서(폰에서는 꾹 누른 채 끌어서). 같은 색 칸을 누르면 지워져요.
      </p>

      {(stats.planTotal > 0 || stats.actualTotal > 0) && (
        <div className="mt-4 space-y-2 border-t border-zinc-100 pt-3 dark:border-zinc-800">
          {areas
            .filter((a) => stats.plan[a.id] || stats.actual[a.id])
            .map((a) => {
              const p = stats.plan[a.id] ?? 0;
              const r = stats.actual[a.id] ?? 0;
              const max = Math.max(stats.planTotal, stats.actualTotal, 1);
              return (
                <div key={a.id} className="text-xs">
                  <div className="mb-1 flex justify-between">
                    <span className="font-medium">{a.name}</span>
                    <span className="text-zinc-400 tabular-nums">
                      <b className="font-semibold text-zinc-700 dark:text-zinc-200">{hours(r)}</b> / 계획 {hours(p)}
                    </span>
                  </div>
                  <div className="relative h-1.5 rounded-full bg-zinc-100 dark:bg-zinc-800">
                    <div
                      className="absolute inset-y-0 left-0 rounded-full opacity-30"
                      style={{ width: `${(p / max) * 100}%`, background: a.color }}
                    />
                    <div
                      className="absolute inset-y-0 left-0 rounded-full"
                      style={{ width: `${(r / max) * 100}%`, background: a.color }}
                    />
                  </div>
                </div>
              );
            })}
          {stats.planTotal > 0 && (
            <p className="pt-1 text-xs text-zinc-500">
              계획대로 실행한 시간 <b className="tabular-nums">{pct(stats.matched, stats.planTotal)}%</b>
            </p>
          )}
        </div>
      )}
    </Card>
  );
}
