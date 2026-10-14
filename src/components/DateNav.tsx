import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useToday } from '../hooks';
import { addDays, DAY_LABELS, diffDays, fmtMD, isoWeek, weekdayIdx, weekStart } from '../lib/date';
import { Button } from './ui';

export function DateNav({
  date,
  setDate,
  mode,
}: {
  date: string;
  setDate: (d: string) => void;
  mode: 'day' | 'week';
}) {
  const today = useToday();
  const step = mode === 'day' ? 1 : 7;
  let title: string, sub: string, current: boolean;

  if (mode === 'day') {
    const diff = diffDays(date, today);
    title = `${fmtMD(date)} ${DAY_LABELS[weekdayIdx(date)]}요일`;
    sub = diff === 0 ? '오늘' : diff === -1 ? '어제' : diff === 1 ? '내일' : diff < 0 ? `${-diff}일 전` : `${diff}일 후`;
    current = diff === 0;
  } else {
    const s = weekStart(date);
    const e = addDays(s, 6);
    title = s.slice(5, 7) === e.slice(5, 7) ? `${fmtMD(s)} – ${Number(e.slice(8))}일` : `${fmtMD(s)} – ${fmtMD(e)}`;
    sub = `${isoWeek(date)}주차`;
    current = s === weekStart(today);
  }

  return (
    <div className="flex items-center gap-2">
      <div className="min-w-0">
        <h1 className="truncate text-[22px] font-bold tracking-tight">{title}</h1>
        <p className="text-sm text-zinc-400">{sub}</p>
      </div>
      <div className="ml-auto flex items-center gap-1">
        {!current && (
          <Button variant="outline" onClick={() => setDate(today)}>
            {mode === 'day' ? '오늘' : '이번 주'}
          </Button>
        )}
        <Button aria-label="이전" className="w-8 px-0" onClick={() => setDate(addDays(date, -step))}>
          <ChevronLeft className="size-5" />
        </Button>
        <Button aria-label="다음" className="w-8 px-0" onClick={() => setDate(addDays(date, step))}>
          <ChevronRight className="size-5" />
        </Button>
      </div>
    </div>
  );
}
