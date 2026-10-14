import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownToLine, Check, MoreHorizontal } from 'lucide-react';
import { addTask, deleteTask, overdueTasks, pullOverdue, updateTask } from '../actions';
import { useToday } from '../hooks';
import { addDays } from '../lib/date';
import { QUADRANTS } from '../lib/defaults';
import type { Task } from '../lib/types';
import { useStore } from '../store';
import { Button, Card, cn } from './ui';

export function FocusBoard({ date }: { date: string }) {
  const tasksRec = useStore((s) => s.data.tasks);
  const today = useToday();
  const tasks = useMemo(
    () =>
      Object.values(tasksRec)
        .filter((t) => !t.deleted && t.date === date)
        .sort((a, b) => Number(a.done) - Number(b.done) || a.sort - b.sort),
    [tasksRec, date],
  );
  const overdue = date === today ? overdueTasks(tasksRec, date).length : 0;

  return (
    <Card
      title="포커스 보드"
      action={
        overdue > 0 && (
          <Button variant="outline" onClick={() => pullOverdue(date)}>
            <ArrowDownToLine className="size-3.5" /> 밀린 할 일 {overdue}개 가져오기
          </Button>
        )
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {QUADRANTS.map((q) => (
          <QuadrantBox key={q.id} q={q} date={date} tasks={tasks.filter((t) => t.quadrant === q.id)} />
        ))}
      </div>
    </Card>
  );
}

function QuadrantBox({ q, date, tasks }: { q: (typeof QUADRANTS)[number]; date: string; tasks: Task[] }) {
  const [text, setText] = useState('');
  const [over, setOver] = useState(false);
  const done = tasks.filter((t) => t.done).length;

  return (
    <div
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes('text/task')) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        setOver(false);
        const id = e.dataTransfer.getData('text/task');
        if (id) updateTask(id, { quadrant: q.id });
      }}
      className={cn('flex min-h-40 flex-col rounded-xl border p-3 transition', q.box, over && `ring-2 ${q.ring}`)}
    >
      <div className="mb-1 flex items-center gap-2 px-1">
        <span className={cn('size-2 rounded-full', q.dot)} />
        <h3 className="text-sm font-semibold">{q.title}</h3>
        <span className="text-[11px] text-zinc-400">{q.hint}</span>
        {tasks.length > 0 && (
          <span className="ml-auto text-xs tabular-nums text-zinc-400">
            {done}/{tasks.length}
          </span>
        )}
      </div>
      <ul className="flex-1">
        {tasks.map((t) => (
          <TaskItem key={t.id} task={t} />
        ))}
      </ul>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!text.trim()) return;
          addTask(date, q.id, text.trim());
          setText('');
        }}
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="+ 할 일 추가"
          className="mt-1 h-8 w-full rounded-lg bg-transparent px-2 text-sm placeholder:text-zinc-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-zinc-300 dark:focus:bg-zinc-900 dark:focus:ring-zinc-700"
        />
      </form>
    </div>
  );
}

function TaskItem({ task: t }: { task: Task }) {
  const [menu, setMenu] = useState(false);
  const ref = useRef<HTMLLIElement>(null);

  useEffect(() => {
    if (!menu) return;
    const close = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setMenu(false);
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [menu]);

  const act = (fn: () => void) => () => {
    fn();
    setMenu(false);
  };

  return (
    <li
      ref={ref}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/task', t.id);
        e.dataTransfer.effectAllowed = 'move';
      }}
      className="group relative flex items-start gap-2.5 rounded-lg px-1 py-1.5 hover:bg-white/80 dark:hover:bg-zinc-800/60"
    >
      <button
        aria-label={t.done ? '완료 취소' : '완료'}
        onClick={() => updateTask(t.id, { done: !t.done })}
        className={cn(
          'mt-px grid size-[18px] shrink-0 place-items-center rounded-[6px] border-[1.5px] transition',
          t.done
            ? 'border-zinc-800 bg-zinc-800 text-white dark:border-zinc-300 dark:bg-zinc-300 dark:text-zinc-900'
            : 'border-zinc-300 bg-white dark:border-zinc-600 dark:bg-transparent',
        )}
      >
        {t.done && <Check className="size-3" strokeWidth={3.5} />}
      </button>
      <span
        className={cn(
          'min-w-0 flex-1 text-sm leading-snug break-words',
          t.done && 'text-zinc-400 line-through decoration-zinc-300 dark:decoration-zinc-600',
        )}
      >
        {t.title}
      </span>
      <button
        aria-label="메뉴"
        aria-expanded={menu}
        onClick={() => setMenu((m) => !m)}
        className="rounded p-0.5 text-zinc-400 hover:text-zinc-700 md:opacity-0 md:group-hover:opacity-100 md:aria-expanded:opacity-100 dark:hover:text-zinc-200"
      >
        <MoreHorizontal className="size-4" />
      </button>
      {menu && (
        <div className="absolute top-full right-0 z-20 mt-1 w-44 rounded-xl border border-zinc-200 bg-white p-1 text-sm shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
          <div className="px-2.5 pt-1 pb-0.5 text-[11px] text-zinc-400">옮기기</div>
          {QUADRANTS.filter((q) => q.id !== t.quadrant).map((q) => (
            <MenuItem key={q.id} onClick={act(() => updateTask(t.id, { quadrant: q.id }))}>
              <span className={cn('size-2 rounded-full', q.dot)} /> {q.title}
            </MenuItem>
          ))}
          <div className="my-1 h-px bg-zinc-100 dark:bg-zinc-800" />
          <MenuItem onClick={act(() => updateTask(t.id, { date: addDays(t.date, 1) }))}>내일로 미루기</MenuItem>
          <MenuItem danger onClick={act(() => deleteTask(t.id))}>
            삭제
          </MenuItem>
        </div>
      )}
    </li>
  );
}

function MenuItem({ children, onClick, danger }: { children: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left hover:bg-zinc-100 dark:hover:bg-zinc-800',
        danger && 'text-rose-600 dark:text-rose-400',
      )}
    >
      {children}
    </button>
  );
}
