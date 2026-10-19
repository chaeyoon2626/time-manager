import { useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { addSession, deleteSession, fillRange, updateSession, type PlanTarget } from '../actions';
import { useActiveProjects, useAreaMap, useAreas, useNow, useProjectMap, useSessions } from '../hooks';
import { atTime, dayBounds, fmtDur, hhmm } from '../lib/date';
import { overlapMin, sumSessions } from '../lib/stats';
import type { Habit, Session, Task } from '../lib/types';
import { ClassifyOptions } from './TaskList';
import { Button, Card, cn, fieldCls } from './ui';

/** 그날 잰 시간: 범주별 합계 + 기록 목록(고치기·지우기) + 깜빡한 기록 추가 */
export function DayLog({ date, tasks, habits }: { date: string; tasks: Task[]; habits: Habit[] }) {
  const sessions = useSessions();
  const areas = useAreaMap();
  const areaList = useAreas();
  const projects = useProjectMap();
  const now = useNow();
  const [from, to] = dayBounds(date);
  const [adding, setAdding] = useState(false);

  const list = useMemo(
    () => sessions.filter((s) => overlapMin(s, from, to, now) > 0).sort((a, b) => a.start.localeCompare(b.start)),
    [sessions, from, to, now],
  );
  const sum = sumSessions(list, from, to, now);

  const colorOf = (s: Session) => areas[s.area_id]?.color ?? '#a1a1aa';
  const nameOf = (s: Session) => {
    const p = projects[s.project_id];
    if (p && s.title && s.title !== p.title) return `${p.title} · ${s.title}`;
    return p?.title || s.title || areas[s.area_id]?.name || '기록';
  };

  return (
    <Card
      title="오늘 기록"
      action={
        <span className="text-xs text-zinc-400 tabular-nums">
          합계 <b className="font-semibold text-zinc-700 dark:text-zinc-200">{fmtDur(sum.total)}</b>
        </span>
      }
    >
      {Object.keys(sum.byArea).length > 0 && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
          {areaList
            .filter((a) => sum.byArea[a.id])
            .map((a) => (
              <span key={a.id} className="flex items-center gap-1.5">
                <span className="size-2 rounded-full" style={{ background: a.color }} />
                {a.name} <b className="font-semibold tabular-nums">{fmtDur(sum.byArea[a.id])}</b>
              </span>
            ))}
          {sum.byArea[''] > 0 && (
            <span className="flex items-center gap-1.5 text-zinc-500">
              <span className="size-2 rounded-full bg-zinc-300" />
              기타 <b className="font-semibold tabular-nums">{fmtDur(sum.byArea[''])}</b>
            </span>
          )}
        </div>
      )}

      <ul className="mt-3 space-y-0.5">
        {list.map((s) => (
          <SessionRow key={s.id} s={s} date={date} name={nameOf(s)} color={colorOf(s)} now={now} />
        ))}
        {list.length === 0 && <li className="py-2 text-sm text-zinc-400">할 일 옆 ▶ 를 누르면 여기에 쌓여요.</li>}
      </ul>

      {adding ? (
        <AddSession date={date} tasks={tasks} habits={habits} onDone={() => setAdding(false)} />
      ) : (
        <Button className="-ml-1 mt-1 text-zinc-400" onClick={() => setAdding(true)}>
          <Plus className="size-4" /> 깜빡한 기록 추가
        </Button>
      )}
    </Card>
  );
}

function SessionRow({ s, date, name, color, now }: { s: Session; date: string; name: string; color: string; now: number }) {
  const [edit, setEdit] = useState(false);
  const dur = (s.end ? Date.parse(s.end) : now) - Date.parse(s.start);
  const t = (iso: string) => hhmm(new Date(iso));
  return (
    <li>
      <button onClick={() => setEdit(!edit)} className="flex w-full items-center gap-2.5 rounded-lg px-1.5 py-1.5 text-left text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
        <span className="h-4 w-1 shrink-0 rounded-full" style={{ background: color }} />
        <span className="w-[86px] shrink-0 text-xs text-zinc-500 tabular-nums">
          {t(s.start)}–{s.end ? t(s.end) : '지금'}
        </span>
        <span className="min-w-0 flex-1 truncate">{name}</span>
        <span className="shrink-0 text-xs font-semibold tabular-nums">{fmtDur(dur / 60_000)}</span>
      </button>
      {edit && (
        <div className="mb-2 ml-3 flex flex-wrap items-center gap-2 rounded-lg bg-zinc-50 p-2 text-xs dark:bg-zinc-800/50">
          <input type="time" value={t(s.start)} onChange={(e) => e.target.value && updateSession(s.id, { start: atTime(date, e.target.value) })} className={cn(fieldCls, 'h-7 px-1.5 text-xs')} aria-label="시작" />
          –
          {s.end ? (
            <input type="time" value={t(s.end)} onChange={(e) => e.target.value && updateSession(s.id, { end: atTime(date, e.target.value) })} className={cn(fieldCls, 'h-7 px-1.5 text-xs')} aria-label="끝" />
          ) : (
            <span className="text-zinc-400">진행 중</span>
          )}
          <button onClick={() => deleteSession(s.id)} className="ml-auto flex items-center gap-1 rounded px-1.5 py-1 text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10">
            <Trash2 className="size-3.5" /> 삭제
          </button>
        </div>
      )}
    </li>
  );
}

/**
 * 깜빡한 기록 추가. 오늘 할 일(끝낸 것 포함)·오늘의 반복 할 일을 그대로 골라 쓸 수 있다.
 * value: "t:<할 일>", "h:<반복 할 일>", "p:<프로젝트>", "a:<범주>"
 */
function AddSession({ date, tasks, habits, onDone }: { date: string; tasks: Task[]; habits: Habit[]; onDone: () => void }) {
  const projects = useActiveProjects();
  const areas = useAreas();
  const first = tasks[0] ? `t:${tasks[0].id}` : habits[0] ? `h:${habits[0].id}` : projects[0] ? `p:${projects[0].id}` : `a:${areas[0]?.id ?? ''}`;
  const [target, setTarget] = useState(first);
  const [start, setStart] = useState('09:00');
  const [end, setEnd] = useState('10:00');
  const [title, setTitle] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const sel = cn(fieldCls, 'h-8 px-2 text-[13px]');
  const kind = target.slice(0, 1);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!target || end <= start) return;
    const id = target.slice(2);
    const t = kind === 't' ? tasks.find((x) => x.id === id) : undefined;
    const h = kind === 'h' ? habits.find((x) => x.id === id) : undefined;
    const p = kind === 'p' ? projects.find((x) => x.id === id) : undefined;
    const pt: PlanTarget = t
      ? { task_id: t.id, habit_id: '', project_id: t.project_id, title: t.title }
      : h
        ? { task_id: '', habit_id: h.id, project_id: h.project_id ?? '', title: h.title }
        : { task_id: '', habit_id: '', project_id: p?.id ?? '', title: title.trim() || p?.title || '' };
    if (kind === 'a') {
      // 범주만 고른 경우: 범주를 직접 지정해서 남긴다
      addSession({ ...pt, area_id: id, start: atTime(date, start), end: atTime(date, end) });
      return onDone();
    }
    // 이미 기록된 시간과 겹치는 부분은 건너뛰고 채운다
    if (fillRange(Date.parse(atTime(date, start)), Date.parse(atTime(date, end)), pt)) onDone();
    else setMsg('그 시간은 이미 다른 기록으로 채워져 있어요.');
  };

  return (
    <form onSubmit={submit} className="mt-2 space-y-2 rounded-xl border border-zinc-200 p-3 dark:border-zinc-700">
      <select value={target} onChange={(e) => setTarget(e.target.value)} className={cn(sel, 'w-full')} aria-label="무엇을 했나">
        {tasks.length > 0 && (
          <optgroup label="오늘 할 일">
            {tasks.map((t) => (
              <option key={t.id} value={`t:${t.id}`}>
                {t.done ? '✓ ' : ''}
                {t.title}
              </option>
            ))}
          </optgroup>
        )}
        {habits.length > 0 && (
          <optgroup label="오늘의 반복 할 일">
            {habits.map((h) => (
              <option key={h.id} value={`h:${h.id}`}>
                {h.title}
              </option>
            ))}
          </optgroup>
        )}
        <ClassifyOptions />
      </select>
      {(kind === 'p' || kind === 'a') && (
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="무엇을 했나요 (선택)" className={cn(sel, 'w-full')} />
      )}
      {msg && <p className="text-xs text-rose-600">{msg}</p>}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <input type="time" value={start} onChange={(e) => setStart(e.target.value)} className={sel} aria-label="시작" />–
        <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} className={sel} aria-label="끝" />
        <Button type="submit" variant="primary" className="ml-auto" disabled={end <= start}>
          추가
        </Button>
        <Button type="button" onClick={onDone}>
          취소
        </Button>
      </div>
    </form>
  );
}
