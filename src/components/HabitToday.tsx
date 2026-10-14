import { useState } from 'react';
import { Check, Flame, Plus } from 'lucide-react';
import { addHabit, toggleHabit } from '../actions';
import { useAreaMap, useAreas, useHabits, useLogSet } from '../hooks';
import { logId } from '../lib/ids';
import { isScheduled, streak } from '../lib/stats';
import type { Area, Habit } from '../lib/types';
import { Button, Card, cn, fieldCls } from './ui';

export function HabitToday({ date }: { date: string }) {
  const habits = useHabits();
  const logs = useLogSet();
  const areaMap = useAreaMap();
  const on = habits.filter((h) => isScheduled(h, date));
  const off = habits.filter((h) => !isScheduled(h, date));
  const doneN = on.filter((h) => logs.has(logId(h.id, date))).length;

  const row = (h: Habit) => (
    <HabitRow
      key={h.id}
      habit={h}
      area={areaMap[h.area_id]}
      done={logs.has(logId(h.id, date))}
      streak={streak(h, logs, date)}
      onToggle={() => toggleHabit(h.id, date)}
    />
  );

  return (
    <Card
      title="습관"
      action={
        on.length > 0 && (
          <span className="text-xs font-medium tabular-nums text-zinc-400">
            {doneN}/{on.length}
          </span>
        )
      }
    >
      {habits.length === 0 && (
        <p className="py-3 text-sm text-zinc-400">매일 챙길 습관을 추가해 보세요. 요일은 설정에서 고를 수 있어요.</p>
      )}
      <ul className="-mx-2">{on.map(row)}</ul>
      {off.length > 0 && (
        <details className="group mt-1">
          <summary className="cursor-pointer list-none py-1 text-xs text-zinc-400 hover:text-zinc-600">
            오늘 쉬는 습관 {off.length}개
          </summary>
          <ul className="-mx-2 opacity-60">{off.map(row)}</ul>
        </details>
      )}
      <QuickAdd />
    </Card>
  );
}

function HabitRow({
  habit,
  area,
  done,
  streak,
  onToggle,
}: {
  habit: Habit;
  area?: Area;
  done: boolean;
  streak: number;
  onToggle: () => void;
}) {
  const color = area?.color ?? '#a1a1aa';
  return (
    <li>
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition hover:bg-zinc-50 active:scale-[0.99] dark:hover:bg-zinc-800/50"
      >
        <span className="h-8 w-1 shrink-0 rounded-full" style={{ background: color }} />
        <span className="min-w-0 flex-1">
          <span
            className={cn(
              'block truncate text-[15px] font-medium transition',
              done && 'text-zinc-400 line-through decoration-zinc-300 dark:decoration-zinc-600',
            )}
          >
            {habit.title}
          </span>
          <span className="flex items-center gap-1 text-xs text-zinc-400">
            {area?.name}
            {streak > 0 && (
              <>
                <span>·</span>
                <Flame className="size-3 text-orange-500" />
                <span className="tabular-nums">{streak}일 연속</span>
              </>
            )}
          </span>
        </span>
        <span
          className={cn(
            'grid size-8 shrink-0 place-items-center rounded-full border-2 transition',
            done ? 'scale-100 border-transparent text-white' : 'border-zinc-300 text-transparent dark:border-zinc-600',
          )}
          style={done ? { background: color } : undefined}
        >
          <Check className="size-4" strokeWidth={3} />
        </span>
      </button>
    </li>
  );
}

function QuickAdd() {
  const areas = useAreas().filter((a) => !a.is_waste);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [area, setArea] = useState(areas[0]?.id ?? 'career');

  if (!open)
    return (
      <Button className="-ml-1 mt-1 text-zinc-400" onClick={() => setOpen(true)}>
        <Plus className="size-4" /> 습관 추가
      </Button>
    );

  return (
    <form
      className="mt-2 flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!title.trim()) return;
        addHabit(title.trim(), area);
        setTitle('');
      }}
    >
      <select
        value={area}
        onChange={(e) => setArea(e.target.value)}
        className={cn(fieldCls, 'h-9 w-24 shrink-0 px-2')}
        aria-label="범주"
      >
        {areas.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </select>
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
        placeholder="예: Anki 단어 복습 20분"
        className={cn(fieldCls, 'h-9 min-w-0 flex-1 px-3')}
      />
      <Button type="submit" variant="primary" className="h-9 shrink-0">
        추가
      </Button>
    </form>
  );
}
