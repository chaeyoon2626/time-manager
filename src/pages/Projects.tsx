import { useMemo, useState } from 'react';
import { ArrowLeft, Check, Play, Plus, Square, Trash2 } from 'lucide-react';
import { addProject, deleteProject, setTarget, stopTimer, timerForProject, toggleProjectDone, updateProject } from '../actions';
import { Outcomes } from '../components/Outcomes';
import { ListHeader, QuickAdd, TaskRow, useTrackedByTask } from '../components/TaskList';
import { Button, Card, cn, fieldCls } from '../components/ui';
import { useAlive, useAreaMap, useAreas, useNow, useRunning, useSessions, useToday } from '../hooks';
import { addDays, dDay, diffDays, fmtDur, fmtShort, fromKey, weekStart } from '../lib/date';
import { effectiveDue, overlapMin, sumSessions, targetFor } from '../lib/stats';
import type { Project, ProjectKind, Task } from '../lib/types';
import { useStore } from '../store';

const byKey = (a: string, b: string) => (a === b ? 0 : !a ? 1 : !b ? -1 : a.localeCompare(b));

export function ProjectsPage({ selected, select }: { selected: string | null; select: (id: string | null) => void }) {
  const projects = useAlive('projects');
  const sel = selected ? projects.find((p) => p.id === selected) : undefined;
  return (
    <div className="grid gap-4 md:grid-cols-[300px_minmax(0,1fr)] md:items-start">
      <div className={cn(sel && 'hidden md:block')}>
        <ProjectList selected={selected} select={select} />
      </div>
      <div className={cn(!sel && 'hidden md:block')}>
        {sel ? (
          <>
            <Button className="-ml-2 mb-2 md:hidden" onClick={() => select(null)}>
              <ArrowLeft className="size-4" /> 목록
            </Button>
            {sel.kind === 'project' ? <ProjectDetail p={sel} /> : <SteadyDetail p={sel} />}
          </>
        ) : (
          <Card>
            <p className="py-10 text-center text-sm text-zinc-400">왼쪽에서 프로젝트를 고르거나 새로 만들어 보세요.</p>
          </Card>
        )}
      </div>
    </div>
  );
}

// ---------- 목록 ----------

function ProjectList({ selected, select }: { selected: string | null; select: (id: string | null) => void }) {
  const projects = useAlive('projects');
  const areas = useAreas();
  const areaMap = useAreaMap();
  const tasks = useStore((s) => s.data.tasks);
  const sessions = useSessions();
  const now = useNow();
  const today = useToday();
  const [adding, setAdding] = useState(false);

  const stats = useMemo(() => {
    const open: Record<string, number> = {};
    for (const t of Object.values(tasks)) if (!t.deleted && !t.done && t.project_id) open[t.project_id] = (open[t.project_id] ?? 0) + 1;
    const total = sumSessions(sessions, 0, Infinity, now).byProject;
    const ws = weekStart(today);
    const week = sumSessions(sessions, fromKey(ws).getTime(), fromKey(addDays(ws, 7)).getTime(), now).byProject;
    return { open, total, week };
  }, [tasks, sessions, now, today]);

  const active = projects.filter((p) => !p.done);
  const done = projects.filter((p) => p.done);
  // 범주 순서대로, 지운 범주에 남은 것은 맨 뒤 "기타"로
  const groups = [...areas.map((a) => ({ id: a.id, name: a.name, color: a.color })), { id: '__none', name: '기타', color: '#a1a1aa' }]
    .map((g) => ({
      ...g,
      items: active
        .filter((p) => (g.id === '__none' ? !areas.some((a) => a.id === p.area_id) : p.area_id === g.id))
        .sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'project' ? -1 : 1) || byKey(a.due, b.due) || a.sort - b.sort),
    }))
    .filter((g) => g.items.length);

  const item = (p: Project) => {
    const color = areaMap[p.area_id]?.color ?? '#a1a1aa';
    const target = targetFor(p, weekStart(today)) * 60;
    return (
      <li key={p.id}>
        <button
          onClick={() => select(p.id)}
          className={cn(
            'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition',
            selected === p.id ? 'bg-zinc-100 dark:bg-zinc-800' : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/50',
          )}
        >
          <span className="size-2.5 shrink-0 rounded-full" style={{ background: color }} />
          <span className={cn('min-w-0 flex-1 truncate text-[15px]', p.done && 'text-zinc-400 line-through')}>{p.title}</span>
          {p.kind === 'project' ? (
            <>
              {p.due && !p.done && (
                <span className={cn('text-xs font-semibold tabular-nums', diffDays(p.due, today) < 0 ? 'text-rose-600' : diffDays(p.due, today) <= 7 ? 'text-orange-500' : 'text-zinc-400')}>
                  {dDay(p.due, today)}
                </span>
              )}
              <span className="w-14 text-right text-xs text-zinc-400 tabular-nums">
                {fmtDur(stats.total[p.id] ?? 0)} · {stats.open[p.id] ?? 0}
              </span>
            </>
          ) : (
            <span className="text-xs text-zinc-400 tabular-nums">
              {fmtDur(stats.week[p.id] ?? 0)}
              {target > 0 && ` / ${fmtDur(target)}`}
            </span>
          )}
        </button>
      </li>
    );
  };

  return (
    <Card
      title="프로젝트 · 꾸준히"
      action={
        <Button variant="outline" onClick={() => setAdding(!adding)}>
          <Plus className="size-4" /> 새로 만들기
        </Button>
      }
    >
      {adding && <NewProject onDone={(id) => (setAdding(false), id && select(id))} />}
      {groups.length === 0 && !adding && (
        <p className="py-6 text-center text-sm text-zinc-400">
          MST·취업준비 같은 <b>프로젝트</b>나
          <br />
          운동·영어 같은 <b>꾸준히</b>를 만들어 보세요.
        </p>
      )}
      <div className="space-y-4">
        {groups.map((g) => (
          <div key={g.id}>
            <div className="mb-1 flex items-center gap-1.5 px-2.5 text-[11px] font-semibold tracking-wide text-zinc-400">{g.name}</div>
            <ul>{g.items.map(item)}</ul>
          </div>
        ))}
      </div>
      {done.length > 0 && (
        <details className="mt-4 border-t border-zinc-100 pt-3 dark:border-zinc-800">
          <summary className="cursor-pointer px-2.5 text-xs font-medium text-zinc-400">끝낸 것 {done.length}개</summary>
          <ul className="mt-1">{done.map(item)}</ul>
        </details>
      )}
      <p className="mt-4 px-2.5 text-[11px] text-zinc-400">프로젝트 옆 숫자: 누적 기록 시간 · 남은 할 일</p>
    </Card>
  );
}

function NewProject({ onDone }: { onDone: (id?: string) => void }) {
  const areas = useAreas();
  const [kind, setKind] = useState<ProjectKind>('project');
  const [title, setTitle] = useState('');
  const [area, setArea] = useState(areas[0]?.id ?? '');
  const [due, setDue] = useState('');
  const [hours, setHours] = useState(3);
  const f = cn(fieldCls, 'h-9 px-2.5');
  return (
    <form
      className="mb-4 space-y-2 rounded-xl border border-zinc-200 p-3 dark:border-zinc-700"
      onSubmit={(e) => {
        e.preventDefault();
        if (!title.trim()) return;
        onDone(addProject(title, area, kind, kind === 'project' ? due : '', kind === 'steady' ? hours : 0));
      }}
    >
      <div className="grid grid-cols-2 gap-1 rounded-lg bg-zinc-100 p-1 dark:bg-zinc-800">
        {(
          [
            ['project', '프로젝트', '할 일 + 마감'],
            ['steady', '꾸준히', '주간 목표 시간'],
          ] as const
        ).map(([k, label, hint]) => (
          <button
            type="button"
            key={k}
            onClick={() => setKind(k)}
            className={cn('rounded-md py-1.5 text-center', kind === k ? 'bg-white shadow-sm dark:bg-zinc-900' : 'text-zinc-500')}
          >
            <div className="text-[13px] font-semibold">{label}</div>
            <div className="text-[10px] text-zinc-400">{hint}</div>
          </button>
        ))}
      </div>
      <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder={kind === 'project' ? '예: MST, 취업준비' : '예: 운동, 영어'} className={cn(f, 'w-full')} />
      <div className="flex gap-2">
        <select value={area} onChange={(e) => setArea(e.target.value)} className={cn(f, 'flex-1')} aria-label="범주">
          {areas.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        {kind === 'project' ? (
          <input type="date" value={due} onChange={(e) => setDue(e.target.value)} className={cn(f, 'flex-1')} aria-label="마감 (없어도 돼요)" title="마감 (없어도 돼요)" />
        ) : (
          <label className="flex flex-1 items-center gap-1.5 text-sm text-zinc-500">
            주
            <input type="number" min={0} step={0.5} value={hours} onChange={(e) => setHours(Number(e.target.value))} className={cn(f, 'w-16')} />
            시간
          </label>
        )}
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" onClick={() => onDone()}>
          취소
        </Button>
        <Button type="submit" variant="primary">
          만들기
        </Button>
      </div>
    </form>
  );
}

// ---------- 상세 ----------

function DetailHeader({ p, children }: { p: Project; children?: React.ReactNode }) {
  const areas = useAreas();
  const areaMap = useAreaMap();
  const running = useRunning();
  const isRunning = running?.project_id === p.id && !running.task_id;
  return (
    <div className="flex flex-wrap items-start gap-3">
      <span className="mt-2.5 size-3 shrink-0 rounded-full" style={{ background: areaMap[p.area_id]?.color ?? '#a1a1aa' }} />
      <div className="min-w-0 flex-1">
        <input
          value={p.title}
          onChange={(e) => updateProject(p.id, { title: e.target.value })}
          className="w-full rounded-lg bg-transparent px-1 text-[22px] font-bold tracking-tight focus:bg-zinc-50 focus:outline-none dark:focus:bg-zinc-800"
          aria-label="이름"
        />
        <div className="mt-1 flex flex-wrap items-center gap-2 px-1 text-sm">
          <select value={p.area_id} onChange={(e) => updateProject(p.id, { area_id: e.target.value })} className={cn(fieldCls, 'h-7 px-1.5 text-xs')} aria-label="범주">
            {areas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          {children}
        </div>
      </div>
      <div className="flex items-center gap-1">
        <Button
          variant={isRunning ? 'danger' : 'outline'}
          onClick={() => (isRunning ? stopTimer() : timerForProject(p))}
          title={p.kind === 'project' ? '할 일을 정하지 않고 이 프로젝트 시간만 재기' : undefined}
        >
          {isRunning ? <Square className="size-3.5" fill="currentColor" /> : <Play className="size-3.5" fill="currentColor" />}
          {isRunning ? '정지' : '시작'}
        </Button>
        <Button variant="outline" onClick={() => toggleProjectDone(p)}>
          <Check className="size-4" /> {p.done ? '다시 진행' : '끝냄'}
        </Button>
        <Button
          aria-label="삭제"
          className="w-8 px-0 text-zinc-400 hover:text-rose-500"
          onClick={() => confirm(`'${p.title}'을(를) 지울까요? 기록한 시간은 남아요.`) && deleteProject(p.id)}
        >
          <Trash2 className="size-4" />
        </Button>
      </div>
      <textarea
        value={p.note ?? ''}
        onChange={(e) => updateProject(p.id, { note: e.target.value })}
        rows={3}
        placeholder={
          p.kind === 'steady'
            ? '메모 — 왜 하는지, 지금 급한 것, 순서, 참고할 유튜브·책 … 아무렇게나 적어도 돼요'
            : '메모 — 이 프로젝트에서 하고 싶은 것, 방향, 참고 자료 … 아무렇게나 적어도 돼요'
        }
        className="field-sizing-content mt-1 min-h-20 w-full basis-full resize-y rounded-xl border border-amber-200/70 bg-amber-50/50 px-3.5 py-3 text-sm leading-relaxed whitespace-pre-wrap placeholder:text-zinc-400 focus:border-amber-300 focus:bg-amber-50 focus:outline-none dark:border-amber-500/20 dark:bg-amber-500/[0.05] dark:focus:bg-amber-500/10"
        aria-label="메모"
      />
    </div>
  );
}

function ProjectDetail({ p }: { p: Project }) {
  const today = useToday();
  const sessions = useSessions();
  const now = useNow();
  const tracked = useTrackedByTask();
  const areaMap = useAreaMap();
  const color = areaMap[p.area_id]?.color ?? '#a1a1aa';
  const { open, done } = useProjectTasks(p.id);
  const total = sessions.filter((s) => s.project_id === p.id).reduce((n, s) => n + overlapMin(s, 0, Infinity, now), 0);
  const estimate = open.reduce((n, t) => n + t.estimate, 0);

  return (
    <Card>
      <DetailHeader p={p}>
        <span className="text-zinc-400">마감</span>
        <input type="date" value={p.due} onChange={(e) => updateProject(p.id, { due: e.target.value })} className={cn(fieldCls, 'h-7 px-1.5 text-xs')} />
        {p.due && <b className={cn('text-sm', diffDays(p.due, today) < 0 ? 'text-rose-600' : 'text-orange-500')}>{dDay(p.due, today)}</b>}
      </DetailHeader>

      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        {[
          ['남은 할 일', `${open.length}개`],
          ['남은 예상', estimate ? fmtDur(estimate) : '–'],
          ['누적 기록', fmtDur(total)],
        ].map(([l, v]) => (
          <div key={l} className="rounded-xl bg-zinc-50 py-2.5 dark:bg-zinc-800/50">
            <div className="text-lg font-bold tabular-nums">{v}</div>
            <div className="text-[11px] text-zinc-400">{l}</div>
          </div>
        ))}
      </div>

      <div className="mt-4">
        <Outcomes p={p} color={color} />
      </div>
      <ProjectTasks p={p} open={open} done={done} tracked={tracked} placeholder="예: 문항 코드 정리 내일 2h ~10/30" />
    </Card>
  );
}

/** 프로젝트·꾸준히 안의 할 일 목록 + 빠른 입력 */
function ProjectTasks({
  p,
  open,
  done,
  tracked,
  placeholder,
}: {
  p: Project;
  open: Task[];
  done: Task[];
  tracked: Record<string, number>;
  placeholder: string;
}) {
  const today = useToday();
  return (
    <div className="mt-5">
      <h3 className="mb-2 text-sm font-bold">할 일</h3>
      <QuickAdd defaultDate="" projectId={p.id} placeholder={`'${p.title}'에 할 일 추가 — ${placeholder}`} />
      <div className="mt-2">
        <ListHeader />
        <ul>
          {open.map((t) => (
            <TaskRow key={t.id} task={t} today={today} viewDate={today} tracked={tracked[t.id] ?? 0} showProject={false} pinnable />
          ))}
          {open.length === 0 && <li className="px-3 py-4 text-sm text-zinc-400">남은 할 일이 없어요.</li>}
        </ul>
        {done.length > 0 && (
          <details className="mt-3 px-1">
            <summary className="cursor-pointer py-1 text-xs font-medium text-zinc-400">완료 {done.length}개</summary>
            <ul className="-mx-1">
              {done.map((t) => (
                <TaskRow key={t.id} task={t} today={today} viewDate={today} tracked={tracked[t.id] ?? 0} showProject={false} />
              ))}
            </ul>
          </details>
        )}
      </div>
    </div>
  );
}

/** 이 프로젝트의 할 일: 남은 것(마감·날짜순), 끝낸 것(최근순) */
function useProjectTasks(projectId: string) {
  const tasksRec = useStore((s) => s.data.tasks);
  const projects = useStore((s) => s.data.projects);
  return useMemo(() => {
    const tasks = Object.values(tasksRec).filter((t) => !t.deleted && t.project_id === projectId);
    const open = tasks
      .filter((t) => !t.done)
      .sort(
        (a, b) =>
          byKey(effectiveDue(a, projects), effectiveDue(b, projects)) ||
          byKey(a.date, b.date) ||
          Number(b.important) - Number(a.important) ||
          a.sort - b.sort,
      );
    const done = tasks.filter((t) => t.done).sort((a, b) => b.done_on.localeCompare(a.done_on));
    return { open, done };
  }, [tasksRec, projects, projectId]);
}

function SteadyDetail({ p }: { p: Project }) {
  const today = useToday();
  const sessions = useSessions();
  const areaMap = useAreaMap();
  const now = useNow();
  const ws = weekStart(today);
  const current = targetFor(p, ws);
  const [hours, setHours] = useState<number | null>(null);
  const color = areaMap[p.area_id]?.color ?? '#a1a1aa';
  const tracked = useTrackedByTask();
  const { open, done } = useProjectTasks(p.id);

  // 최근 8주: 실제 vs 그 주 목표
  const weeks = Array.from({ length: 8 }, (_, i) => addDays(ws, -7 * (7 - i)));
  const mine = sessions.filter((s) => s.project_id === p.id);
  const rows = weeks.map((w) => ({
    w,
    min: mine.reduce((n, s) => n + overlapMin(s, fromKey(w).getTime(), fromKey(addDays(w, 7)).getTime(), now), 0),
    target: targetFor(p, w) * 60,
  }));
  const max = Math.max(...rows.map((r) => Math.max(r.min, r.target)), 60);
  const thisWeek = rows[rows.length - 1];

  return (
    <Card>
      <DetailHeader p={p} />
      <div className="mt-5 rounded-xl bg-zinc-50 p-4 dark:bg-zinc-800/50">
        <div className="flex items-baseline justify-between">
          <span className="text-sm font-semibold">이번 주</span>
          <span className="text-sm tabular-nums">
            <b className="text-xl font-bold">{fmtDur(thisWeek.min)}</b>
            <span className="text-zinc-400"> / {current ? `${current}h` : '목표 없음'}</span>
          </span>
        </div>
        <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-white dark:bg-zinc-900">
          <div className="h-full rounded-full" style={{ width: `${current ? Math.min(thisWeek.min / (current * 60), 1) * 100 : 0}%`, background: color }} />
        </div>
        <form
          className="mt-4 flex flex-wrap items-center gap-2 text-sm"
          onSubmit={(e) => {
            e.preventDefault();
            if (hours === null || hours < 0) return;
            setTarget(p, hours);
            setHours(null);
          }}
        >
          <span className="text-zinc-500">주간 투자 시간</span>
          <input
            type="number"
            min={0}
            step={0.5}
            value={hours ?? current}
            onChange={(e) => setHours(Number(e.target.value))}
            className={cn(fieldCls, 'h-8 w-20 px-2')}
            aria-label="주간 투자 시간"
          />
          시간
          <Button type="submit" variant="primary" disabled={hours === null || hours === current}>
            이번 주부터 적용
          </Button>
        </form>
        <p className="mt-2 text-[11px] text-zinc-400">조금씩 올리다가, 원하는 수준이 되면 그대로 두면 “유지”예요. 바꾼 기록은 아래에 남아요.</p>
      </div>

      <div className="mt-4">
        <Outcomes p={p} color={color} />
      </div>
      <ProjectTasks p={p} open={open} done={done} tracked={tracked} placeholder="예: 단어 50개 오늘 30m, 듣기 모의고사 금요일 1h" />

      <h3 className="mt-6 mb-2 text-xs font-semibold text-zinc-500">최근 8주 투자 시간</h3>
      <div className="grid h-40 grid-cols-8 items-end gap-2">
        {rows.map((r) => (
          <div key={r.w} className="relative flex h-full flex-col items-center justify-end gap-1">
            <span className="text-[10px] text-zinc-400 tabular-nums">{r.min ? fmtDur(r.min) : ''}</span>
            <div className="relative w-full max-w-8" style={{ height: `${(Math.max(r.min, r.target) / max) * 100}%` }}>
              <div className="absolute inset-x-0 bottom-0 rounded-md" style={{ height: `${r.target ? Math.min((r.min / Math.max(r.target, r.min)) * 100, 100) : 100}%`, background: color, opacity: r.min ? 1 : 0 }} />
              {r.target > 0 && (
                <div
                  className="absolute inset-x-[-3px] border-t-2 border-dashed border-zinc-400 dark:border-zinc-500"
                  style={{ bottom: `${(r.target / Math.max(r.target, r.min)) * 100}%` }}
                  title={`목표 ${fmtDur(r.target)}`}
                />
              )}
            </div>
            <span className={cn('text-[10px] tabular-nums', r.w === ws ? 'font-bold' : 'text-zinc-400')}>{fmtShort(r.w)}</span>
          </div>
        ))}
      </div>
      <p className="mt-1 text-[11px] text-zinc-400">점선 = 그 주 투자 목표</p>

      {(p.targets ?? []).length > 0 && (
        <>
          <h3 className="mt-6 mb-2 text-xs font-semibold text-zinc-500">주간 투자 시간 변화</h3>
          <ol className="space-y-1 text-sm">
            {[...(p.targets ?? [])].reverse().map((t, i, arr) => {
              const prev = arr[i + 1];
              return (
                <li key={t.from} className="flex items-center gap-3">
                  <span className="w-20 text-xs text-zinc-400 tabular-nums">{fmtShort(t.from)} 주부터</span>
                  <b className="tabular-nums">주 {t.hours}h</b>
                  {prev && (
                    <span className={cn('text-xs', t.hours > prev.hours ? 'text-emerald-600' : t.hours < prev.hours ? 'text-rose-500' : 'text-zinc-400')}>
                      {t.hours > prev.hours ? `▲ ${t.hours - prev.hours}h` : t.hours < prev.hours ? `▼ ${prev.hours - t.hours}h` : '유지'}
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        </>
      )}
    </Card>
  );
}
