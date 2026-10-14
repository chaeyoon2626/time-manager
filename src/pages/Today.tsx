import { useMemo } from 'react';
import { saveReview } from '../actions';
import { DateNav } from '../components/DateNav';
import { FocusBoard } from '../components/FocusBoard';
import { HabitToday } from '../components/HabitToday';
import { TimeBar } from '../components/TimeBar';
import { Card, Stat, textareaCls } from '../components/ui';
import { useAreaMap, useHabits, useLogSet } from '../hooks';
import { hours } from '../lib/date';
import { logId, reviewId } from '../lib/ids';
import { dayBlocks, isScheduled, pct } from '../lib/stats';
import { useStore } from '../store';

export function TodayPage({ date, setDate }: { date: string; setDate: (d: string) => void }) {
  return (
    <div className="space-y-4">
      <DateNav date={date} setDate={setDate} mode="day" />
      <DaySummary date={date} />
      {/* 핵심은 습관 + 시간 기록: 폰에서는 습관 → 타임바 → 할 일 → 회고 순서,
          넓은 화면에서는 타임바를 오른쪽에 고정 (왼쪽 묶음은 폰에서 display:contents로 풀린다) */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
        <div className="contents lg:block lg:space-y-4">
          <div className="order-1">
            <HabitToday date={date} />
          </div>
          <div className="order-3">
            <FocusBoard date={date} />
          </div>
          <div className="order-4">
            <DailyReview date={date} />
          </div>
        </div>
        <div className="order-2 lg:sticky lg:top-[72px]">
          <TimeBar date={date} />
        </div>
      </div>
    </div>
  );
}

function DaySummary({ date }: { date: string }) {
  const habits = useHabits();
  const logs = useLogSet();
  const tasksRec = useStore((s) => s.data.tasks);
  const blocks = useStore((s) => s.data.time_blocks);
  const areaMap = useAreaMap();

  const on = habits.filter((h) => isScheduled(h, date));
  const habitDone = on.filter((h) => logs.has(logId(h.id, date))).length;
  const tasks = useMemo(() => Object.values(tasksRec).filter((t) => !t.deleted && t.date === date), [tasksRec, date]);
  const b = dayBlocks(blocks, areaMap, date);

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <Stat label="습관" value={`${pct(habitDone, on.length)}%`} sub={`${habitDone}/${on.length}`} />
      <Stat label="할 일" value={tasks.filter((t) => t.done).length} sub={`/ ${tasks.length}개`} />
      <Stat label="집중 시간" value={hours(b.focus)} sub={b.actualTotal > b.focus ? `낭비 ${hours(b.actualTotal - b.focus)}` : undefined} />
      <Stat label="계획 실행률" value={b.planTotal ? `${pct(b.matched, b.planTotal)}%` : '–'} sub={b.planTotal ? `계획 ${hours(b.planTotal)}` : '계획 없음'} />
    </div>
  );
}

function DailyReview({ date }: { date: string }) {
  const review = useStore((s) => s.data.reviews[reviewId('day', date)]);
  return (
    <Card title="오늘 한 줄 회고">
      <textarea
        rows={3}
        value={review?.line ?? ''}
        onChange={(e) => saveReview('day', date, { line: e.target.value })}
        placeholder="오늘 시간을 잘 쓴 점, 아쉬운 점, 내일 바꿀 한 가지"
        className={textareaCls}
      />
    </Card>
  );
}
