import { useMemo, useState } from 'react';
import { Pencil, Plus, Undo2 } from 'lucide-react';
import { chooseForSubarea, subareaDue, subareaSuggestions, toggleSkip } from '../actions';
import { useAreaMap, useNow, useProjectMap, useSessions } from '../hooks';
import { addDays, fmtDur, fromKey, weekStart } from '../lib/date';
import { sumSessions, targetFor } from '../lib/stats';
import type { Project, Subarea, Task } from '../lib/types';
import { useStore } from '../store';
import { MilestoneHint, TaskRow } from './TaskList';
import { cn, fieldCls } from './ui';

/**
 * 오늘 목록 ① 안의 세부 영역 묶음.
 * 프로젝트·꾸준히마다 한 묶음으로, 그날 하는 세부 영역만:
 *   고정     → 자동으로 생긴 그날 할 일
 *   그날 정하기 → "오늘 뭐 할까?" + 예전에 한 것 칩 + 직접 적기 + 오늘은 쉬기
 */
export function SubareaGroups({
  date,
  today,
  routineTasks,
  tracked,
}: {
  date: string;
  today: string;
  routineTasks: Task[];
  tracked: Record<string, number>;
}) {
  const subareas = useStore((s) => s.data.subareas);
  const projects = useProjectMap();
  const areas = useAreaMap();
  const sessions = useSessions();
  const now = useNow();

  const groups = useMemo(() => {
    const byProject = new Map<string, { p: Project; items: { sa: Subarea | null; tasks: Task[] }[] }>();
    const group = (p: Project) => {
      if (!byProject.has(p.id)) byProject.set(p.id, { p, items: [] });
      return byProject.get(p.id)!;
    };
    const live = Object.values(subareas)
      .filter((sa) => !sa.deleted && !sa.archived)
      .sort((a, b) => a.sort - b.sort);
    for (const sa of live) {
      const p = projects[sa.project_id];
      if (!p || p.deleted || p.done) continue;
      const tasks = routineTasks.filter((t) => t.subarea_id === sa.id).sort((a, b) => a.sort - b.sort);
      if (!subareaDue(sa, date) && !tasks.length) continue;
      group(p).items.push({ sa, tasks });
    }
    // 세부 영역이 지워졌는데 그날 할 일이 남은 경우
    for (const t of routineTasks) {
      if (subareas[t.subarea_id ?? '']?.deleted === false) continue;
      const p = projects[t.project_id];
      if (!p) continue;
      const g = group(p);
      const orphan = g.items.find((i) => i.sa === null) ?? (g.items.push({ sa: null, tasks: [] }), g.items[g.items.length - 1]);
      orphan.tasks.push(t);
    }
    const order = (p: Project) => [areas[p.area_id]?.sort ?? 99, p.sort] as const;
    return [...byProject.values()].sort((x, y) => order(x.p)[0] - order(y.p)[0] || order(x.p)[1] - order(y.p)[1]);
  }, [subareas, projects, routineTasks, date, areas]);

  const ws = weekStart(date);
  const week = useMemo(
    () => sumSessions(sessions, fromKey(ws).getTime(), fromKey(addDays(ws, 7)).getTime(), now).byProject,
    [sessions, ws, now],
  );

  if (!groups.length) return null;
  return (
    <div className="mt-1 space-y-2">
      {groups.map(({ p, items }) => {
        const color = areas[p.area_id]?.color ?? '#a1a1aa';
        const target = p.kind === 'steady' ? targetFor(p, ws) * 60 : 0;
        return (
          <div key={p.id} className="rounded-xl border border-zinc-100 bg-zinc-50/50 py-1 dark:border-zinc-800 dark:bg-zinc-800/20">
            <div className="flex items-baseline gap-2 px-3 pt-1.5 pb-0.5">
              <span className="size-2 shrink-0 translate-y-[-1px] rounded-full" style={{ background: color }} />
              <a href={`#projects/${p.id}`} className="min-w-0 truncate text-[13px] font-bold hover:underline">
                {p.title}
              </a>
              <MilestoneHint p={p} today={today} />
              {target > 0 && (
                <span className="ml-auto shrink-0 text-[11px] text-zinc-400 tabular-nums">
                  이번 주 <b className="font-semibold text-zinc-600 dark:text-zinc-300">{fmtDur(week[p.id] ?? 0)}</b> / {fmtDur(target)}
                </span>
              )}
            </div>
            <ul>
              {items.map(({ sa, tasks }) =>
                sa ? (
                  <SubareaItem key={sa.id} sa={sa} tasks={tasks} date={date} today={today} tracked={tracked} />
                ) : (
                  tasks.map((t) => <TaskRow key={t.id} task={t} today={today} viewDate={date} tracked={tracked[t.id] ?? 0} chipLabel={p.title} />)
                ),
              )}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

function SubareaItem({
  sa,
  tasks,
  date,
  today,
  tracked,
}: {
  sa: Subarea;
  tasks: Task[];
  date: string;
  today: string;
  tracked: Record<string, number>;
}) {
  const [more, setMore] = useState(false);
  const skipped = (sa.skips ?? []).includes(date);
  const due = subareaDue(sa, date);
  const ask = sa.mode === 'choose' && due && !skipped && (tasks.length === 0 || more);

  return (
    <>
      {tasks.map((t) => (
        <TaskRow key={t.id} task={t} today={today} viewDate={date} tracked={tracked[t.id] ?? 0} chipLabel={sa.name} />
      ))}
      {skipped && tasks.length === 0 && (
        <li className="flex items-center gap-2 px-3 py-2 text-[13px] text-zinc-400">
          <span className="font-medium">{sa.name}</span> — 오늘은 쉬어요
          <button onClick={() => toggleSkip(sa, date)} className="ml-auto flex items-center gap-1 rounded px-1.5 py-0.5 text-xs hover:bg-zinc-100 dark:hover:bg-zinc-800">
            <Undo2 className="size-3" /> 되돌리기
          </button>
        </li>
      )}
      {ask && <ChoosePrompt sa={sa} date={date} onDone={() => setMore(false)} canSkip={tasks.length === 0} />}
      {sa.mode === 'choose' && due && !skipped && tasks.length > 0 && !more && (
        <li className="px-3 pb-1">
          <button onClick={() => setMore(true)} className="flex items-center gap-1 text-[11px] font-medium text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200">
            <Plus className="size-3" /> {sa.name} 더 하기
          </button>
        </li>
      )}
    </>
  );
}

/** "오늘 뭐 할까?" — 예전에 한 것 칩을 누르거나 직접 적으면 그 세부 영역의 오늘 할 일이 된다 */
function ChoosePrompt({ sa, date, onDone, canSkip }: { sa: Subarea; date: string; onDone: () => void; canSkip: boolean }) {
  const [text, setText] = useState('');
  // 할 일이 바뀌면 칩도 다시 계산되도록 tasks를 구독
  const tasksRec = useStore((s) => s.data.tasks);
  const suggestions = useMemo(() => subareaSuggestions(sa), [sa, tasksRec]); // eslint-disable-line react-hooks/exhaustive-deps
  const pick = (title: string, estimate = 0) => {
    chooseForSubarea(sa, title, date, estimate);
    setText('');
    onDone();
  };
  return (
    <li className="px-3 py-2">
      <div className="flex items-center gap-2 text-[14px]">
        <Pencil className="size-3.5 shrink-0 text-zinc-400" />
        <span className="font-semibold">{sa.name}</span>
        <span className="text-zinc-400">— 오늘 뭐 할까?</span>
        {canSkip && (
          <button onClick={() => toggleSkip(sa, date)} className="ml-auto shrink-0 rounded px-1.5 py-0.5 text-[11px] text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800">
            오늘은 쉬기
          </button>
        )}
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5 pl-5">
        {suggestions.map((s) => (
          <button
            key={s.title}
            onClick={() => pick(s.title, s.estimate)}
            className="flex h-7 max-w-full items-center gap-1 rounded-full border border-zinc-200 bg-white px-2.5 text-xs font-medium text-zinc-700 hover:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
          >
            <span className="truncate">{s.title}</span>
            {s.estimate > 0 && <span className="text-zinc-400">{fmtDur(s.estimate)}</span>}
          </button>
        ))}
        <form
          className="min-w-40 flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            if (text.trim()) pick(text);
          }}
        >
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={suggestions.length ? '직접 적기…' : `예: ${sa.name} 무엇을 할지 적기`}
            className={cn(fieldCls, 'h-7 w-full rounded-full px-3 text-xs')}
          />
        </form>
      </div>
    </li>
  );
}
