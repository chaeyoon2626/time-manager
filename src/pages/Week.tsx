import { Check, Flame } from 'lucide-react';
import { saveReview, toggleHabit } from '../actions';
import { DateNav } from '../components/DateNav';
import { Card, Stat, cn, textareaCls } from '../components/ui';
import { useAreaMap, useAreas, useHabits, useLogSet, useToday } from '../hooks';
import { DAY_LABELS, fmtShort, hours, weekDays, weekStart } from '../lib/date';
import { logId, reviewId } from '../lib/ids';
import { dayBlocks, isScheduled, pct, streak, sumBlocks } from '../lib/stats';
import type { Habit, Review } from '../lib/types';
import { useStore } from '../store';

export function WeekPage({ date, setDate }: { date: string; setDate: (d: string) => void }) {
  const days = weekDays(date);
  const today = useToday();
  const habits = useHabits();
  const logs = useLogSet();
  const areas = useAreas();
  const areaMap = useAreaMap();
  const blocks = useStore((s) => s.data.time_blocks);

  // 달성률 분모: 습관을 만든 날부터 오늘까지, 해야 하는 요일만
  const countable = (h: Habit) => days.filter((d) => d >= h.created_on && d <= today && isScheduled(h, d));
  let scheduled = 0;
  let done = 0;
  for (const h of habits) {
    const sch = countable(h);
    scheduled += sch.length;
    done += sch.filter((d) => logs.has(logId(h.id, d))).length;
  }

  const perDay = days.map((d) => dayBlocks(blocks, areaMap, d));
  const week = sumBlocks(perDay);

  return (
    <div className="space-y-4">
      <DateNav date={date} setDate={setDate} mode="week" />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="습관 달성률" value={`${pct(done, scheduled)}%`} sub={`${done}/${scheduled}`} />
        <Stat label="집중 시간" value={hours(week.focus)} sub={`기록 ${hours(week.actualTotal)}`} />
        <Stat label="집중 비율" value={week.actualTotal ? `${pct(week.focus, week.actualTotal)}%` : '–'} sub="낭비 제외" />
        <Stat label="계획 실행률" value={week.planTotal ? `${pct(week.matched, week.planTotal)}%` : '–'} sub={`계획 ${hours(week.planTotal)}`} />
      </div>

      <Card title="습관 체크표">
        {habits.length === 0 ? (
          <p className="py-3 text-sm text-zinc-400">아직 습관이 없어요. 오늘 탭이나 설정에서 추가해 보세요.</p>
        ) : (
          <div className="-mx-4 overflow-x-auto px-4">
            <table className="w-full min-w-[560px] border-separate border-spacing-y-1 text-sm">
              <thead>
                <tr className="text-xs text-zinc-400">
                  <th className="sticky left-0 bg-white pr-2 text-left font-medium dark:bg-zinc-900">습관</th>
                  {days.map((d, i) => (
                    <th
                      key={d}
                      className={cn('w-11 font-medium', d === today && 'text-zinc-900 dark:text-zinc-100')}
                    >
                      <div>{DAY_LABELS[i]}</div>
                      <div className="text-[10px] font-normal tabular-nums">{fmtShort(d)}</div>
                    </th>
                  ))}
                  <th className="w-16 font-medium">연속</th>
                  <th className="w-14 font-medium">달성</th>
                </tr>
              </thead>
              <tbody>
                {habits.map((h) => {
                  const color = areaMap[h.area_id]?.color ?? '#a1a1aa';
                  const sch = countable(h);
                  const dn = sch.filter((d) => logs.has(logId(h.id, d))).length;
                  const st = streak(h, logs, days.includes(today) ? today : days[6]);
                  return (
                    <tr key={h.id}>
                      <td className="sticky left-0 max-w-[180px] bg-white pr-2 dark:bg-zinc-900">
                        <div className="flex items-center gap-2">
                          <span className="h-5 w-1 shrink-0 rounded-full" style={{ background: color }} />
                          <span className="truncate font-medium">{h.title}</span>
                        </div>
                      </td>
                      {days.map((d) => {
                        const on = logs.has(logId(h.id, d));
                        const sched = isScheduled(h, d);
                        return (
                          <td key={d} className="text-center">
                            <button
                              aria-label={`${fmtShort(d)} ${on ? '완료 취소' : '완료'}`}
                              onClick={() => toggleHabit(h.id, d)}
                              className={cn(
                                'mx-auto grid size-8 place-items-center rounded-lg border transition active:scale-90',
                                on && 'border-transparent text-white',
                                !on && sched && 'border-zinc-200 bg-zinc-50 hover:border-zinc-300 dark:border-zinc-700 dark:bg-zinc-800/50',
                                !on && !sched && 'border-dashed border-zinc-200 dark:border-zinc-800',
                              )}
                              style={on ? { background: color } : undefined}
                            >
                              {on && <Check className="size-4" strokeWidth={3} />}
                            </button>
                          </td>
                        );
                      })}
                      <td className="text-center text-xs tabular-nums">
                        {st > 0 ? (
                          <span className="inline-flex items-center gap-0.5 font-semibold text-orange-500">
                            <Flame className="size-3.5" />
                            {st}
                          </span>
                        ) : (
                          <span className="text-zinc-300 dark:text-zinc-600">0</span>
                        )}
                      </td>
                      <td className="text-center text-xs font-semibold tabular-nums text-zinc-500">{pct(dn, sch.length)}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card title="영역 밸런스">
          <div className="space-y-3">
            {areas.map((a) => {
              const p = week.plan[a.id] ?? 0;
              const r = week.actual[a.id] ?? 0;
              const max = Math.max(...areas.map((x) => Math.max(week.plan[x.id] ?? 0, week.actual[x.id] ?? 0)), 1);
              return (
                <div key={a.id}>
                  <div className="mb-1 flex items-baseline gap-2 text-sm">
                    <span className="size-2 rounded-full" style={{ background: a.color }} />
                    <span className="font-medium">{a.name}</span>
                    {!a.required && !a.is_waste && <span className="text-[11px] text-zinc-400">선택</span>}
                    {a.required && r === 0 && <span className="text-[11px] font-medium text-amber-600">이번 주 기록 없음</span>}
                    <span className="ml-auto text-xs text-zinc-400 tabular-nums">
                      <b className="font-semibold text-zinc-700 dark:text-zinc-200">{hours(r)}</b> / 계획 {hours(p)}
                    </span>
                  </div>
                  <div className="relative h-2 rounded-full bg-zinc-100 dark:bg-zinc-800">
                    <div className="absolute inset-y-0 left-0 rounded-full opacity-25" style={{ width: `${(p / max) * 100}%`, background: a.color }} />
                    <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${(r / max) * 100}%`, background: a.color }} />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        <Card title="요일별 실제 시간">
          <DayColumns days={days} perDay={perDay} today={today} />
        </Card>
      </div>

      <WeeklyReview weekKey={weekStart(date)} days={days} />
    </div>
  );
}

function DayColumns({
  days,
  perDay,
  today,
}: {
  days: string[];
  perDay: ReturnType<typeof dayBlocks>[];
  today: string;
}) {
  const areas = useAreas();
  const max = Math.max(...perDay.map((d) => d.actualTotal), 8);
  return (
    <div className="grid h-52 grid-cols-7 items-end gap-2">
      {perDay.map((d, i) => (
        <div key={days[i]} className="flex h-full flex-col items-center justify-end gap-1.5">
          <span className="text-[11px] text-zinc-400 tabular-nums">{d.actualTotal ? hours(d.actualTotal) : ''}</span>
          <div
            className="flex w-full max-w-9 flex-col-reverse overflow-hidden rounded-md bg-zinc-100 dark:bg-zinc-800"
            style={{ height: `${Math.max((d.actualTotal / max) * 100, 3)}%` }}
          >
            {areas.map((a) =>
              d.actual[a.id] ? (
                <div key={a.id} title={`${a.name} ${hours(d.actual[a.id])}`} style={{ height: `${(d.actual[a.id] / d.actualTotal) * 100}%`, background: a.color }} />
              ) : null,
            )}
          </div>
          <span className={cn('text-xs', days[i] === today ? 'font-bold' : 'text-zinc-400')}>{DAY_LABELS[i]}</span>
        </div>
      ))}
    </div>
  );
}

const FIELDS: { key: keyof Pick<Review, 'good' | 'bad' | 'why' | 'next_action'>; label: string; hint: string }[] = [
  { key: 'good', label: '잘한 점', hint: '시간을 잘 쓴 순간, 지킨 루틴' },
  { key: 'bad', label: '아쉬운 점', hint: '계획과 달랐던 곳, 낭비된 시간' },
  { key: 'why', label: '왜 그랬나', hint: '원인을 한두 개만' },
  { key: 'next_action', label: '다음 주에 바꿀 것', hint: '구체적인 행동 하나' },
];

function WeeklyReview({ weekKey, days }: { weekKey: string; days: string[] }) {
  const reviews = useStore((s) => s.data.reviews);
  const review = reviews[reviewId('week', weekKey)];
  const lines = days.map((d) => [d, reviews[reviewId('day', d)]?.line] as const).filter(([, l]) => l?.trim());

  return (
    <Card title="주간 회고">
      <div className="grid gap-3 md:grid-cols-2">
        {FIELDS.map((f) => (
          <label key={f.key} className="block">
            <span className="mb-1 block text-sm font-semibold">{f.label}</span>
            <textarea
              rows={3}
              value={review?.[f.key] ?? ''}
              onChange={(e) => saveReview('week', weekKey, { [f.key]: e.target.value })}
              placeholder={f.hint}
              className={textareaCls}
            />
          </label>
        ))}
      </div>
      {lines.length > 0 && (
        <div className="mt-4 border-t border-zinc-100 pt-3 dark:border-zinc-800">
          <h3 className="mb-2 text-xs font-semibold text-zinc-500">이번 주 한 줄 회고</h3>
          <ul className="space-y-1.5 text-sm">
            {lines.map(([d, l]) => (
              <li key={d} className="flex gap-3">
                <span className="w-9 shrink-0 text-xs leading-5 text-zinc-400 tabular-nums">{fmtShort(d)}</span>
                <span className="whitespace-pre-wrap text-zinc-600 dark:text-zinc-300">{l}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
