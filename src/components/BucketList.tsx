import { useEffect, useMemo, useState } from 'react';
import { Check, CalendarPlus, Shuffle, Trash2, X } from 'lucide-react';
import { addBucket, bucketToToday, deleteBucket, toggleBucket } from '../actions';
import { useAlive, useAreaMap, useAreas } from '../hooks';
import { fmtShort } from '../lib/date';
import type { BucketItem } from '../lib/types';
import { Button, cn, fieldCls } from './ui';

const DURATIONS = [
  { min: 0, label: '시간 모름' },
  { min: 30, label: '30분' },
  { min: 60, label: '1시간' },
  { min: 120, label: '2시간' },
  { min: 240, label: '반나절' },
  { min: 480, label: '하루' },
];
const durationLabel = (m: number) => DURATIONS.find((d) => d.min === m)?.label ?? `${m}분`;

/** "지금 시간이 이만큼 있어" 필터 — 걸리는 시간을 적어둔 항목만 고른다 */
const FILTERS = [
  { limit: null, label: '전체' },
  { limit: 30, label: '30분 있어' },
  { limit: 60, label: '1시간 있어' },
  { limit: 120, label: '2시간 있어' },
] as const;

export function BucketList({ onClose }: { onClose: () => void }) {
  const all = useAlive('bucket_items');
  const areas = useAreas().filter((a) => !a.is_waste);
  const areaMap = useAreaMap();
  const [limit, setLimit] = useState<number | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [added, setAdded] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [minutes, setMinutes] = useState(0);
  const [area, setArea] = useState('');

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', esc);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', esc);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const open = useMemo(
    () =>
      all
        .filter((b) => !b.done && (limit === null || (b.minutes > 0 && b.minutes <= limit)))
        .sort((a, b) => a.sort - b.sort),
    [all, limit],
  );
  const done = useMemo(() => all.filter((b) => b.done).sort((a, b) => b.done_on.localeCompare(a.done_on)), [all]);

  const pickRandom = () => {
    const pool = open.filter((b) => b.id !== picked);
    const list = pool.length ? pool : open;
    if (list.length) setPicked(list[Math.floor(Math.random() * list.length)].id);
  };

  const row = (b: BucketItem) => {
    const a = areaMap[b.area_id];
    return (
      <li
        key={b.id}
        className={cn(
          'group flex items-start gap-3 rounded-xl px-2 py-2.5 transition',
          picked === b.id ? 'bg-amber-50 ring-1 ring-amber-300 dark:bg-amber-500/10 dark:ring-amber-500/40' : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/50',
        )}
      >
        <button
          aria-label={b.done ? '해낸 것 취소' : '해냈어요'}
          onClick={() => toggleBucket(b)}
          className={cn(
            'mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border-[1.5px] transition',
            b.done ? 'border-transparent bg-emerald-500 text-white' : 'border-zinc-300 dark:border-zinc-600',
          )}
        >
          {b.done && <Check className="size-3" strokeWidth={3.5} />}
        </button>
        <div className="min-w-0 flex-1">
          <div className={cn('text-[15px] leading-snug break-words', b.done && 'text-zinc-400 line-through decoration-zinc-300')}>
            {b.title}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-zinc-400">
            {a && (
              <span className="flex items-center gap-1">
                <span className="size-1.5 rounded-full" style={{ background: a.color }} />
                {a.name}
              </span>
            )}
            {b.minutes > 0 && <span>{durationLabel(b.minutes)}</span>}
            {b.done && b.done_on && <span>{fmtShort(b.done_on)} 해냄</span>}
          </div>
        </div>
        {!b.done && (
          <Button
            className="h-7 shrink-0 px-2 text-xs"
            title="오늘 포커스 보드 '성장 투자'에 넣기"
            onClick={() => {
              bucketToToday(b);
              setAdded(b.id);
              setTimeout(() => setAdded((x) => (x === b.id ? null : x)), 1500);
            }}
          >
            {added === b.id ? <Check className="size-3.5" /> : <CalendarPlus className="size-3.5" />}
            {added === b.id ? '넣었어요' : '오늘 하기'}
          </Button>
        )}
        <button
          aria-label="삭제"
          onClick={() => deleteBucket(b.id)}
          className="mt-0.5 rounded p-1 text-zinc-300 hover:text-rose-500 md:opacity-0 md:group-hover:opacity-100 dark:text-zinc-600"
        >
          <Trash2 className="size-3.5" />
        </button>
      </li>
    );
  };

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="버킷리스트">
      <div className="anim-fade absolute inset-0 bg-zinc-950/30 backdrop-blur-[2px]" onClick={onClose} />
      <aside className="anim-sheet absolute inset-x-0 bottom-0 flex max-h-[88dvh] flex-col rounded-t-3xl bg-white shadow-2xl md:inset-y-0 md:right-0 md:left-auto md:max-h-none md:w-[440px] md:rounded-none md:rounded-l-3xl dark:bg-zinc-900">
        <div className="mx-auto mt-2.5 h-1 w-10 rounded-full bg-zinc-200 md:hidden dark:bg-zinc-700" />
        <header className="flex items-start gap-3 px-5 pt-4 pb-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold tracking-tight">버킷리스트</h2>
            <p className="text-xs text-zinc-400">시간이 남을 때 꺼내 보는 하고 싶은 것들</p>
          </div>
          <Button aria-label="닫기" className="w-8 px-0" onClick={onClose}>
            <X className="size-5" />
          </Button>
        </header>

        <form
          className="space-y-2 border-b border-zinc-100 px-5 pb-4 dark:border-zinc-800"
          onSubmit={(e) => {
            e.preventDefault();
            if (!title.trim()) return;
            addBucket(title.trim(), minutes, area);
            setTitle('');
          }}
        >
          <div className="flex gap-2">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="예: 베이스로 좋아하는 곡 한 곡 카피"
              className={cn(fieldCls, 'h-10 min-w-0 flex-1 px-3')}
            />
            <Button type="submit" variant="primary" className="h-10 shrink-0 px-4">
              추가
            </Button>
          </div>
          <div className="flex gap-2">
            <select value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} className={cn(fieldCls, 'h-8 flex-1 px-2 text-xs')} aria-label="걸리는 시간">
              {DURATIONS.map((d) => (
                <option key={d.min} value={d.min}>
                  {d.min ? `약 ${d.label}` : d.label}
                </option>
              ))}
            </select>
            <select value={area} onChange={(e) => setArea(e.target.value)} className={cn(fieldCls, 'h-8 flex-1 px-2 text-xs')} aria-label="영역">
              <option value="">영역 없음</option>
              {areas.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
        </form>

        <div className="flex items-center gap-1.5 overflow-x-auto px-5 py-3">
          {FILTERS.map((f) => (
            <button
              key={f.label}
              onClick={() => {
                setLimit(f.limit);
                setPicked(null);
              }}
              className={cn(
                'h-7 shrink-0 rounded-full px-3 text-xs font-medium transition',
                limit === f.limit ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900' : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300',
              )}
            >
              {f.label}
            </button>
          ))}
          <Button variant="outline" className="ml-auto h-7 shrink-0 text-xs" onClick={pickRandom} disabled={!open.length}>
            <Shuffle className="size-3.5" /> 하나 골라줘
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-[calc(16px+env(safe-area-inset-bottom))]">
          {open.length === 0 && (
            <p className="px-2 py-6 text-center text-sm text-zinc-400">
              {all.some((b) => !b.done)
                ? '이 시간 안에 할 수 있는 게 없어요. 걸리는 시간을 적어두면 골라드려요.'
                : '시간 날 때 해보고 싶은 걸 적어두세요.'}
            </p>
          )}
          <ul>{open.map(row)}</ul>
          {done.length > 0 && (
            <details className="mt-3 px-2">
              <summary className="cursor-pointer py-1 text-xs font-medium text-zinc-400">해낸 것 {done.length}개</summary>
              <ul className="-mx-2">{done.map(row)}</ul>
            </details>
          )}
        </div>
      </aside>
    </div>
  );
}
