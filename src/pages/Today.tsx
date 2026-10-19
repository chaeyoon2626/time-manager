import { Fragment, useMemo } from 'react';
import { saveReview } from '../actions';
import { DateNav } from '../components/DateNav';
import { DayLog } from '../components/DayLog';
import { Timetable } from '../components/Timetable';
import { AreaTargetRow, HabitRow, ListHeader, QuickAdd, SectionTitle, SteadyRow, TaskRow, useTrackedByTask } from '../components/TaskList';
import { Card, Stat, cn, textareaCls } from '../components/ui';
import { useActiveProjects, useAreaMap, useAreas, useHabits, useLogSet, useNow, useProjectMap, useSessions, useToday } from '../hooks';
import { addDays, DAY_LABELS, dayBounds, diffDays, fmtDur, fmtShort, fromKey, weekdayIdx, weekStart } from '../lib/date';
import { DAILY_AREA } from '../lib/defaults';
import { logId, reviewId } from '../lib/ids';
import { effectiveDue, isScheduled, streak, sumSessions, targetFor } from '../lib/stats';
import type { Tables, Task } from '../lib/types';
import { useStore } from '../store';

/** 빈 값('')은 맨 뒤로 */
const byKey = (a: string, b: string) => (a === b ? 0 : !a ? 1 : !b ? -1 : a.localeCompare(b));

/** ②의 기준 날짜: 할 날과 마감 중 더 빠른 날 ('' = 날짜 없음) */
const whenOf = (t: Task, projects: Tables['projects']) => {
  const ds = [t.date, effectiveDue(t, projects)].filter(Boolean).sort();
  return ds[0] ?? '';
};

function DateHeader({ when, today }: { when: string; today: string }) {
  const n = when ? diffDays(when, today) : null;
  return (
    <li className="mt-3 mb-0.5 flex items-baseline gap-2 border-b border-zinc-100 px-3 pb-1 dark:border-zinc-800">
      <span className="text-[13px] font-bold tabular-nums">{when ? `${fmtShort(when)} (${DAY_LABELS[weekdayIdx(when)]})` : '날짜 없음'}</span>
      {n !== null && (
        <span className={cn('text-xs font-semibold tabular-nums', n <= 2 ? 'text-orange-500' : 'text-zinc-400')}>
          {n === 0 ? '오늘' : n === 1 ? '내일' : n > 0 ? `D-${n}` : `${-n}일 지남`}
        </span>
      )}
    </li>
  );
}

export function TodayPage({ date, setDate }: { date: string; setDate: (d: string) => void }) {
  const today = useToday();
  const tasksRec = useStore((s) => s.data.tasks);
  const projects = useProjectMap();
  const areas = useAreaMap();
  const habits = useHabits();
  const logs = useLogSet();
  const steady = useActiveProjects().filter((p) => p.kind === 'steady');
  const areaList = useAreas();
  const sessions = useSessions();
  const now = useNow();
  const tracked = useTrackedByTask();

  const { todayList, laterList, doneList } = useMemo(() => {
    const all = Object.values(tasksRec).filter((t) => !t.deleted);
    const isToday = (t: Task) =>
      t.date === date || t.due === date || (date === today && ((!!t.date && t.date < today) || (!!t.due && t.due < today)));
    const late = (t: Task) => (!!t.date && t.date < today) || (!!t.due && t.due < today);
    const open = all.filter((t) => !t.done);
    const todayList = open
      .filter(isToday)
      .sort(
        (a, b) =>
          Number(late(b)) - Number(late(a)) ||
          byKey(a.time, b.time) ||
          Number(b.important) - Number(a.important) ||
          byKey(effectiveDue(a, projects), effectiveDue(b, projects)) ||
          a.sort - b.sort,
      );
    // ②: 가장 가까운 날짜(할 날·마감 중 빠른 쪽)순, 같은 날짜 안에서는 분류끼리 모은다
    const groupRank = (t: Task) => {
      const p = projects[t.project_id];
      if (!p) return [areas[t.area_id || DAILY_AREA]?.sort ?? 99, Infinity] as const; // 프로젝트 없는 할 일은 그 범주 묶음의 뒤
      return [areas[p.area_id]?.sort ?? 99, p.sort] as const;
    };
    const laterList = open
      .filter((t) => !isToday(t))
      .sort((a, b) => {
        const [ra, sa] = groupRank(a);
        const [rb, sb] = groupRank(b);
        return (
          byKey(whenOf(a, projects), whenOf(b, projects)) ||
          ra - rb ||
          sa - sb ||
          Number(b.important) - Number(a.important) ||
          byKey(a.time, b.time) ||
          a.sort - b.sort
        );
      });
    const doneList = all.filter((t) => t.done && (t.done_on === date || (!t.done_on && t.date === date)));
    return { todayList, laterList, doneList };
  }, [tasksRec, projects, areas, date, today]);

  const todaysHabits = habits.filter((h) => isScheduled(h, date));
  const habitDone = todaysHabits.filter((h) => logs.has(logId(h.id, date))).length;
  // 예정 시간 = 오늘 할 일 + 오늘의 반복 할 일 예상 시간 합계
  const planned = [...todayList, ...doneList].reduce((n, t) => n + t.estimate, 0) + todaysHabits.reduce((n, h) => n + (h.estimate ?? 0), 0);
  const [from, to] = dayBounds(date);
  const actual = sumSessions(sessions, from, to, now).total;
  const ws = weekStart(date);
  const week = sumSessions(sessions, fromKey(ws).getTime(), fromKey(addDays(ws, 7)).getTime(), now);
  // 주간 목표가 걸린 범주 (예: 운동 주 4h)
  const areaTargets = areaList.filter((a) => targetFor(a, ws) > 0);

  return (
    <div className="space-y-4">
      <DateNav date={date} setDate={setDate} mode="day" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="예정 시간" value={planned ? fmtDur(planned) : '–'} sub="예상 합계" />
        <Stat label="실제 시간" value={fmtDur(actual)} sub="타이머 기록" />
        <Stat label="할 일" value={doneList.length} sub={`/ ${todayList.length + doneList.length}개`} />
        <Stat label="반복" value={habitDone} sub={`/ ${todaysHabits.length}개`} />
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        <div className="min-w-0 space-y-4">
        <section className="rounded-2xl border border-zinc-200/80 bg-white p-3 sm:p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <QuickAdd defaultDate={date} />
          <div className="mt-3">
            <ListHeader />
            <SectionTitle
              n={1}
              title={date === today ? '오늘 할 일 · 오늘 마감' : '이 날 할 일 · 마감'}
              right={todayList.length + todaysHabits.length > 0 ? `${todayList.length + todaysHabits.length}개` : undefined}
            />
            <ul>
              {todayList.map((t) => (
                <TaskRow key={t.id} task={t} today={today} viewDate={date} tracked={tracked[t.id] ?? 0} />
              ))}
              {todaysHabits.map((h) => (
                <HabitRow key={h.id} habit={h} date={date} logs={logs} streakDays={streak(h, logs, date)} />
              ))}
              {todayList.length + todaysHabits.length === 0 && (
                <li className="px-3 py-3 text-sm text-zinc-400">비어 있어요. 위에 바로 적거나, 아래 ②에서 <b>오늘</b>을 눌러 가져오세요.</li>
              )}
            </ul>

            <SectionTitle n={2} title="프로젝트 할 일 · 다가오는 일" right={laterList.length ? `마감순 · ${laterList.length}개` : undefined} />
            <ul>
              {laterList.map((t, i) => {
                const when = whenOf(t, projects);
                const newGroup = i === 0 || whenOf(laterList[i - 1], projects) !== when;
                return (
                  <Fragment key={t.id}>
                    {newGroup && <DateHeader when={when} today={today} />}
                    <TaskRow task={t} today={today} viewDate={date} tracked={tracked[t.id] ?? 0} pinnable hideDate />
                  </Fragment>
                );
              })}
              {laterList.length === 0 && (
                <li className="px-3 py-3 text-sm text-zinc-400">
                  남은 일이 없어요. <a href="#projects" className="underline">프로젝트</a>에서 할 일을 적어두면 마감순으로 여기 모여요.
                </li>
              )}
            </ul>

            {steady.length + areaTargets.length > 0 && (
              <>
                <SectionTitle n={3} title="꾸준히 · 이번 주 목표" />
                <ul>
                  {areaTargets.map((a) => (
                    <AreaTargetRow key={a.id} area={a} today={today} weekMinutes={week.byArea[a.id] ?? 0} />
                  ))}
                  {steady.map((p) => (
                    <SteadyRow key={p.id} project={p} today={today} weekMinutes={week.byProject[p.id] ?? 0} />
                  ))}
                </ul>
              </>
            )}

            {doneList.length > 0 && (
              <details className="mt-4 px-1">
                <summary className="cursor-pointer py-1 text-xs font-medium text-zinc-400">완료 {doneList.length}개</summary>
                <ul className="-mx-1">
                  {doneList.map((t) => (
                    <TaskRow key={t.id} task={t} today={today} viewDate={date} tracked={tracked[t.id] ?? 0} />
                  ))}
                </ul>
              </details>
            )}
          </div>
        </section>
          <Timetable date={date} tasks={[...todayList, ...doneList]} habits={todaysHabits} />
        </div>

        <div className="space-y-4 lg:sticky lg:top-[72px]">
          <DayLog date={date} tasks={[...todayList, ...doneList]} habits={todaysHabits} />
          <DailyReview date={date} />
        </div>
      </div>
    </div>
  );
}

function DailyReview({ date }: { date: string }) {
  const review = useStore((s) => s.data.reviews[reviewId('day', date)]);
  return (
    <Card title="한 줄 회고">
      <textarea
        rows={2}
        value={review?.line ?? ''}
        onChange={(e) => saveReview('day', date, { line: e.target.value })}
        placeholder="오늘 시간을 잘 쓴 점, 아쉬운 점, 내일 바꿀 한 가지"
        className={textareaCls}
      />
    </Card>
  );
}
