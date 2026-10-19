import { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, Check, CalendarPlus, Shuffle, Trash2, X } from 'lucide-react';
import { addBucket, bucketToToday, deleteBucket, promoteIdea, toggleBucket, updateBucket } from '../actions';
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
  const everything = useAlive('bucket_items');
  const [tab, setTab] = useState<'bucket' | 'idea'>('bucket');
  // 버킷리스트 탭은 kind가 없거나 bucket인 것만
  const all = useMemo(() => everything.filter((b) => (b.kind ?? 'bucket') === 'bucket'), [everything]);
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
            <div className="flex gap-1 rounded-xl bg-zinc-100 p-1 dark:bg-zinc-800">
              {(
                [
                  ['bucket', '버킷리스트'],
                  ['idea', '하고 싶은 것'],
                ] as const
              ).map(([k, label]) => (
                <button
                  key={k}
                  onClick={() => setTab(k)}
                  className={cn(
                    'flex-1 rounded-lg py-1.5 text-sm font-semibold transition',
                    tab === k ? 'bg-white shadow-sm dark:bg-zinc-900' : 'text-zinc-500',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-zinc-400">
              {tab === 'bucket' ? '시간이 남을 때 꺼내 보는 것들' : '언젠가 해보고 싶은 것 — 마음이 서면 프로젝트·꾸준히로 올려요'}
            </p>
          </div>
          <Button aria-label="닫기" className="w-8 px-0" onClick={onClose}>
            <X className="size-5" />
          </Button>
        </header>

        {tab === 'idea' ? (
          <IdeaPanel items={everything.filter((b) => b.kind === 'idea')} />
        ) : (
          <>
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
            <select value={area} onChange={(e) => setArea(e.target.value)} className={cn(fieldCls, 'h-8 flex-1 px-2 text-xs')} aria-label="범주">
              <option value="">범주 없음</option>
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
          </>
        )}
      </aside>
    </div>
  );
}

/** 하고 싶은 것: 제목 + 아무렇게나 적는 메모, 마음이 서면 프로젝트·꾸준히로 올리기 */
function IdeaPanel({ items }: { items: BucketItem[] }) {
  const areas = useAreas();
  const areaMap = useAreaMap();
  const [title, setTitle] = useState('');
  const [area, setArea] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [moved, setMoved] = useState<string | null>(null);
  const open = items.filter((b) => !b.done).sort((a, b) => a.sort - b.sort);
  const promoted = items.filter((b) => b.done).sort((a, b) => b.done_on.localeCompare(a.done_on));

  return (
    <>
      <form
        className="flex gap-2 border-b border-zinc-100 px-5 pb-4 dark:border-zinc-800"
        onSubmit={(e) => {
          e.preventDefault();
          if (!title.trim()) return;
          addBucket(title.trim(), 0, area, 'idea');
          setTitle('');
        }}
      >
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: 서평 블로그 운영" className={cn(fieldCls, 'h-10 min-w-0 flex-1 px-3')} />
        <select value={area} onChange={(e) => setArea(e.target.value)} className={cn(fieldCls, 'h-10 w-20 shrink-0 px-1.5 text-xs')} aria-label="범주">
          <option value="">범주</option>
          {areas.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <Button type="submit" variant="primary" className="h-10 shrink-0 px-4">
          추가
        </Button>
      </form>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pt-2 pb-[calc(16px+env(safe-area-inset-bottom))]">
        {moved && <p className="mx-2 mb-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">{moved}</p>}
        {open.length === 0 && <p className="px-2 py-6 text-center text-sm text-zinc-400">버킷리스트라기엔 작고, 당장 목표로 삼기엔 이른 것들을 적어두세요.</p>}
        <ul className="space-y-1">
          {open.map((b) => {
            const a = areaMap[b.area_id];
            const isOpen = openId === b.id;
            return (
              <li key={b.id} className="rounded-xl px-2 py-2 hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                <button onClick={() => setOpenId(isOpen ? null : b.id)} className="flex w-full items-start gap-2 text-left">
                  <span className="mt-1.5 size-2 shrink-0 rounded-full" style={{ background: a?.color ?? '#d4d4d8' }} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] leading-snug break-words">{b.title}</span>
                    {!isOpen && b.note && <span className="mt-0.5 line-clamp-1 block text-xs text-zinc-400">{b.note}</span>}
                  </span>
                </button>
                {isOpen && (
                  <div className="mt-2 space-y-2 pl-4">
                    <textarea
                      value={b.note ?? ''}
                      onChange={(e) => updateBucket(b.id, { note: e.target.value })}
                      rows={4}
                      placeholder="왜 하고 싶은지, 어떻게 시작할지, 참고할 것 … 아무렇게나"
                      className="field-sizing-content min-h-24 w-full resize-y rounded-xl border border-amber-200/70 bg-amber-50/50 px-3 py-2.5 text-sm leading-relaxed focus:outline-none dark:border-amber-500/20 dark:bg-amber-500/[0.05]"
                    />
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-xs text-zinc-400">마음이 섰다면</span>
                      <Button variant="outline" className="h-7 text-xs" onClick={() => (promoteIdea(b, 'project'), setMoved(`'${b.title}'을(를) 프로젝트로 올렸어요.`))}>
                        <ArrowUpRight className="size-3.5" /> 프로젝트로
                      </Button>
                      <Button variant="outline" className="h-7 text-xs" onClick={() => (promoteIdea(b, 'steady'), setMoved(`'${b.title}'을(를) 꾸준히로 올렸어요.`))}>
                        <ArrowUpRight className="size-3.5" /> 꾸준히로
                      </Button>
                      <button aria-label="삭제" onClick={() => deleteBucket(b.id)} className="ml-auto rounded p-1 text-zinc-400 hover:text-rose-500">
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        {promoted.length > 0 && (
          <details className="mt-3 px-2">
            <summary className="cursor-pointer py-1 text-xs font-medium text-zinc-400">올린 것 {promoted.length}개</summary>
            <ul className="mt-1 space-y-1 text-sm text-zinc-400">
              {promoted.map((b) => (
                <li key={b.id} className="flex gap-2">
                  <span className="w-10 shrink-0 text-xs tabular-nums">{fmtShort(b.done_on)}</span>
                  {b.title}
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </>
  );
}
