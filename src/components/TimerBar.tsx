import { Square } from 'lucide-react';
import { isLongRun, stopTimer } from '../actions';
import { useAreaMap, useNow, useProjectMap, useRunning } from '../hooks';
import { hhmm, toKey } from '../lib/date';
import { cn } from './ui';

const clock = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`;
};

/** 타이머가 돌고 있을 때만 화면 아래에 뜬다 */
export function TimerBar() {
  const run = useRunning();
  const now = useNow(1000);
  const projects = useProjectMap();
  const areas = useAreaMap();
  if (!run) return null;
  const p = projects[run.project_id];
  const color = areas[run.area_id]?.color ?? '#a1a1aa';
  const label = p && p.title !== run.title ? `${p.title} · ${run.title}` : run.title || areas[run.area_id]?.name || '기록 중';
  // 3시간 넘게 켜져 있으면 "끄는 걸 깜빡했나?" — 주황색으로 알리고, 정지하면 끝난 시각을 물어본다
  const long = isLongRun(run, now);
  const sameDay = toKey(new Date(run.start)) === toKey(new Date(now));
  return (
    <div className="fixed inset-x-0 bottom-[calc(72px+env(safe-area-inset-bottom))] z-40 flex justify-center px-3 md:bottom-5">
      <div
        className={cn(
          'anim-sheet flex w-full max-w-md items-center gap-3 rounded-2xl py-2 pr-2 pl-4 shadow-2xl',
          long ? 'bg-amber-500 text-white' : 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900',
        )}
      >
        <span className="relative flex size-2.5 shrink-0">
          <span className="absolute inset-0 animate-ping rounded-full opacity-60" style={{ background: long ? '#fff' : color }} />
          <span className="relative size-2.5 rounded-full" style={{ background: long ? '#fff' : color }} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{label}</div>
          <div className="truncate text-[11px] opacity-75">
            {sameDay ? '' : `${new Date(run.start).getMonth() + 1}/${new Date(run.start).getDate()} `}
            {hhmm(new Date(run.start))}부터{long && ' · 끄는 걸 깜빡했나요?'}
          </div>
        </div>
        <span className="font-mono text-lg font-semibold tabular-nums">{clock(now - Date.parse(run.start))}</span>
        <button
          onClick={() => void stopTimer()}
          className="flex h-10 items-center gap-1.5 rounded-xl bg-rose-500 px-3.5 text-sm font-semibold text-white active:scale-95"
        >
          <Square className="size-3.5" fill="currentColor" /> 정지
        </button>
      </div>
    </div>
  );
}
