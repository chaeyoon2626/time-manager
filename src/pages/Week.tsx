import { useMemo } from 'react';
import { Check, Flame } from 'lucide-react';
import { saveReview, toggleHabit } from '../actions';
import { DateNav } from '../components/DateNav';
import { Card, Stat, cn, textareaCls } from '../components/ui';
import { useActiveProjects, useAreaMap, useAreas, useHabits, useLogSet, useNow, useSessions, useToday } from '../hooks';
import { addDays, DAY_LABELS, dayBounds, fmtDur, fmtShort, fromKey, weekDays, weekStart } from '../lib/date';
import { logId, reviewId } from '../lib/ids';
import { isScheduled, pct, streak, sumSessions, targetFor } from '../lib/stats';
import type { Habit, Review } from '../lib/types';
import { useStore } from '../store';

export function WeekPage({ date, setDate }: { date: string; setDate: (d: string) => void }) {
  const days = weekDays(date);
  const ws = weekStart(date);
  const today = useToday();
  const habits = useHabits();
  const logs = useLogSet();
  const areas = useAreas();
  const areaMap = useAreaMap();
  const sessions = useSessions();
  const projects = useActiveProjects();
  const tasksRec = useStore((s) => s.data.tasks);
  const now = useNow();

  // 달성률 분모: 습관을 만든 날부터 오늘까지, 해야 하는 요일만
  const countable = (h: Habit) => days.filter((d) => d >= h.created_on && d <= today && isScheduled(h, d));
  let scheduled = 0;
  let done = 0;
  for (const h of habits) {
    const sch = countable(h);
    scheduled += sch.length;
    done += sch.filter((d) => logs.has(logId(h.id, d))).length;
  }

  const week = sumSessions(sessions, fromKey(ws).getTime(), fromKey(addDays(ws, 7)).getTime(), now);
  const perDay = days.map((d) => {
    const [a, b] = dayBounds(d);
    return sumSessions(sessions, a, b, now);
  });
  const doneTasks = useMemo(
    () => Object.values(tasksRec).filter((t) => !t.deleted && t.done && t.done_on >= ws && t.done_on <= days[6]).length,
    [tasksRec, ws, days],
  );
  const projectRows = projects
    .filter((p) => week.byProject[p.id] || (p.kind === 'steady' && targetFor(p, ws)))
    .sort((a, b) => (week.byProject[b.id] ?? 0) - (week.byProject[a.id] ?? 0));

  return (
    <div className="space-y-4">
      <DateNav date={date} setDate={setDate} mode="week" />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="기록한 시간" value={fmtDur(week.total)} sub="타이머" />
        <Stat label="하루 평균" value={fmtDur(week.total / Math.max(1, days.filter((d) => d <= today).length))} />
        <Stat label="끝낸 할 일" value={doneTasks} sub="개" />
        <Stat label="반복 달성률" value={`${pct(done, scheduled)}%`} sub={`${done}/${scheduled}`} />
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-2">
        <Card title="범주 밸런스">
          <div className="space-y-3">
            {areas.map((a) => {
              const m = week.byArea[a.id] ?? 0;
              const max = Math.max(...Object.values(week.byArea), 1);
              return (
                <div key={a.id}>
                  <div className="mb-1 flex items-baseline gap-2 text-sm">
                    <span className="size-2 rounded-full" style={{ background: a.color }} />
                    <span className="font-medium">{a.name}</span>
                    {a.required && m === 0 && <span className="text-[11px] font-medium text-amber-600">이번 주 기록 없음</span>}
                    <span className="ml-auto text-xs font-semibold tabular-nums">{fmtDur(m)}</span>
                  </div>
                  <div className="h-2 rounded-full bg-zinc-100 dark:bg-zinc-800">
                    <div className="h-full rounded-full" style={{ width: `${(m / max) * 100}%`, background: a.color }} />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        <Card title="프로젝트 · 꾸준히별 시간">
          {projectRows.length === 0 ? (
            <p className="py-3 text-sm text-zinc-400">이번 주 기록이 아직 없어요.</p>
          ) : (
            <ul className="space-y-2.5">
              {projectRows.map((p) => {
                const m = week.byProject[p.id] ?? 0;
                const target = p.kind === 'steady' ? targetFor(p, ws) * 60 : 0;
                const color = areaMap[p.area_id]?.color ?? '#a1a1aa';
                return (
                  <li key={p.id}>
                    <a href={`#projects/${p.id}`} className="mb-1 flex items-baseline gap-2 text-sm hover:underline">
                      <span className="size-2 rounded-full" style={{ background: color }} />
                      <span className="min-w-0 truncate font-medium">{p.title}</span>
                      <span className="ml-auto shrink-0 text-xs tabular-nums">
                        <b className="font-semibold">{fmtDur(m)}</b>
                        {target > 0 && <span className="text-zinc-400"> / {fmtDur(target)}</span>}
                      </span>
                    </a>
                    {target > 0 && (
                      <div className="h-1.5 rounded-full bg-zinc-100 dark:bg-zinc-800">
                        <div className="h-full rounded-full" style={{ width: `${Math.min(m / target, 1) * 100}%`, background: color }} />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      <Card title="요일별 기록">
        <div className="grid h-44 grid-cols-7 items-end gap-2">
          {perDay.map((d, i) => {
            const max = Math.max(...perDay.map((x) => x.total), 240);
            return (
              <div key={days[i]} className="flex h-full flex-col items-center justify-end gap-1.5">
                <span className="text-[11px] text-zinc-400 tabular-nums">{d.total ? fmtDur(d.total) : ''}</span>
                <div className="flex w-full max-w-10 flex-col-reverse overflow-hidden rounded-md bg-zinc-100 dark:bg-zinc-800" style={{ height: `${Math.max((d.total / max) * 100, 3)}%` }}>
                  {[...areas.map((a) => a.id), ''].map((id) =>
                    d.byArea[id] ? <div key={id || 'none'} style={{ height: `${(d.byArea[id] / d.total) * 100}%`, background: areaMap[id]?.color ?? '#d4d4d8' }} /> : null,
                  )}
                </div>
                <span className={cn('text-xs', days[i] === today ? 'font-bold' : 'text-zinc-400')}>{DAY_LABELS[i]}</span>
              </div>
            );
          })}
        </div>
      </Card>

      <Card title="반복 할 일 체크표">
        {habits.length === 0 ? (
          <p className="py-3 text-sm text-zinc-400">아직 반복 할 일이 없어요. 오늘 화면에서 “일기 매일”처럼 적어 보세요.</p>
        ) : (
          <div className="-mx-4 overflow-x-auto px-4">
            <table className="w-full min-w-[560px] border-separate border-spacing-y-1 text-sm">
              <thead>
                <tr className="text-xs text-zinc-400">
                  <th className="sticky left-0 bg-white pr-2 text-left font-medium dark:bg-zinc-900">반복 할 일</th>
                  {days.map((d, i) => (
                    <th key={d} className={cn('w-11 font-medium', d === today && 'text-zinc-900 dark:text-zinc-100')}>
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
                      <td className="text-center text-xs font-semibold text-zinc-500 tabular-nums">{pct(dn, sch.length)}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <WeeklyReview weekKey={ws} days={days} />
    </div>
  );
}

const FIELDS: { key: keyof Pick<Review, 'good' | 'bad' | 'why' | 'next_action'>; label: string; hint: string }[] = [
  { key: 'good', label: '잘한 점', hint: '시간을 잘 쓴 순간, 지킨 루틴' },
  { key: 'bad', label: '아쉬운 점', hint: '계획과 달랐던 곳, 새어 나간 시간' },
  { key: 'why', label: '왜 그랬나', hint: '원인을 한두 개만' },
  { key: 'next_action', label: '다음 주에 바꿀 것', hint: '구체적인 행동 하나 (꾸준히 목표 조정도 여기서)' },
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
