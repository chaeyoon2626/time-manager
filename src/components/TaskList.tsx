import { useMemo, useState, type ReactNode } from 'react';
import { CalendarPlus, Check, Flame, Play, Repeat, Square, Star, Trash2 } from 'lucide-react';
import {
  activeMilestone,
  addTaskFromText,
  deleteTask,
  stopTimer,
  timerForHabit,
  timerForProject,
  timerForTask,
  toggleHabit,
  toggleTask,
  updateTask,
} from '../actions';
import { useActiveProjects, useAreaMap, useAreas, useNow, useProjectMap, useRunning, useSessions, useToday } from '../hooks';
import { addDays, DAY_LABELS, dDay, diffDays, fmtDur, fmtShort, weekStart } from '../lib/date';
import { DAILY_AREA } from '../lib/defaults';
import { logId } from '../lib/ids';
import { parseTask } from '../lib/parse';
import { effectiveDue, overlapMin, targetFor } from '../lib/stats';
import type { Habit, Project, Task } from '../lib/types';
import { cn, fieldCls } from './ui';

// ---------- 표 모양 ----------

/**
 * 넓은 화면: 체크 | 할 일 | 분류 | 예상 | 마감 | 버튼
 * 분류 = 일회성 / 프로젝트 이름(취업준비, MST …) / 범주 이름(습관·꾸준히: 공부, 운동 …)
 */
const GRID = 'md:grid md:grid-cols-[28px_minmax(0,1fr)_128px_76px_56px_96px] md:items-center md:gap-x-2';

export function ListHeader() {
  return (
    <div className={cn('hidden px-3 pb-1 text-[11px] font-medium text-zinc-400', GRID)}>
      <span />
      <span>할 일</span>
      <span>분류</span>
      <span>예상</span>
      <span>마감</span>
      <span />
    </div>
  );
}

export function SectionTitle({ n, title, right }: { n: number; title: string; right?: ReactNode }) {
  return (
    <div className="mt-5 mb-1.5 flex items-baseline gap-2 px-1 first:mt-0">
      <span className="grid size-5 place-items-center rounded-full bg-zinc-900 text-[11px] font-bold text-white dark:bg-zinc-100 dark:text-zinc-900">
        {n}
      </span>
      <h2 className="text-[15px] font-bold tracking-tight">{title}</h2>
      {right && <span className="ml-auto text-xs text-zinc-400 tabular-nums">{right}</span>}
    </div>
  );
}

/** 반복 요일 → "매일", "평일", "월수금" */
export const repeatLabel = (weekdays: number[]) => {
  if (weekdays.length === 0 || weekdays.length === 7) return '매일';
  const s = [...weekdays].sort((a, b) => a - b).join('');
  if (s === '01234') return '평일';
  if (s === '56') return '주말';
  return weekdays.map((d) => DAY_LABELS[d]).join('');
};

function Chip({ name, color }: { name?: string; color?: string }) {
  if (!name) return <span className="text-zinc-300 dark:text-zinc-600">—</span>;
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 text-[13px] text-zinc-600 dark:text-zinc-300">
      <span className="size-2 shrink-0 rounded-full" style={{ background: color ?? '#a1a1aa' }} />
      <span className="truncate">{name}</span>
    </span>
  );
}

function DueText({ due, today }: { due: string; today: string }) {
  if (!due) return <span className="text-zinc-300 dark:text-zinc-600">–</span>;
  const n = diffDays(due, today);
  return (
    <span
      title={fmtShort(due)}
      className={cn(
        'text-[13px] font-semibold tabular-nums',
        n < 0 ? 'text-rose-600' : n <= 2 ? 'text-orange-500' : n <= 7 ? 'text-zinc-700 dark:text-zinc-200' : 'text-zinc-400',
      )}
    >
      {dDay(due, today)}
    </span>
  );
}

function CheckButton({ done, color, onClick, label }: { done: boolean; color?: string; onClick: () => void; label: string }) {
  return (
    <button
      aria-label={label}
      onClick={onClick}
      className={cn(
        'grid size-[22px] shrink-0 place-items-center rounded-full border-2 transition active:scale-90',
        done ? 'border-transparent text-white' : 'border-zinc-300 hover:border-zinc-400 dark:border-zinc-600',
      )}
      style={done ? { background: color ?? '#18181b' } : undefined}
    >
      {done && <Check className="size-3" strokeWidth={3.5} />}
    </button>
  );
}

function PlayButton({ running, onStart }: { running: boolean; onStart: () => void }) {
  return (
    <button
      aria-label={running ? '타이머 정지' : '타이머 시작'}
      onClick={running ? stopTimer : onStart}
      className={cn(
        'grid size-8 shrink-0 place-items-center rounded-full transition active:scale-90',
        running ? 'bg-rose-500 text-white shadow-sm' : 'text-zinc-400 hover:bg-zinc-100 hover:text-zinc-800 dark:hover:bg-zinc-800 dark:hover:text-zinc-100',
      )}
    >
      {running ? <Square className="size-3.5" fill="currentColor" /> : <Play className="size-4" fill="currentColor" />}
    </button>
  );
}

/** 모바일에서는 제목 아래에 한 줄로: 프로젝트 · 종류 · 예상 · 마감 */
function MobileMeta({ children }: { children: ReactNode }) {
  return <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs md:hidden">{children}</div>;
}

// ---------- 기록된 시간 ----------

/** 할 일별로 지금까지 잰 시간(분) */
export function useTrackedByTask() {
  const sessions = useSessions();
  const now = useNow();
  return useMemo(() => {
    const m: Record<string, number> = {};
    for (const s of sessions) if (s.task_id) m[s.task_id] = (m[s.task_id] ?? 0) + overlapMin(s, 0, Infinity, now);
    return m;
  }, [sessions, now]);
}

function EstimateText({ estimate, tracked }: { estimate: number; tracked: number }) {
  if (!estimate && !tracked) return <span className="text-zinc-300 dark:text-zinc-600">–</span>;
  return (
    <span className="text-[13px] tabular-nums whitespace-nowrap">
      {tracked > 0 && <b className={cn('font-semibold', estimate && tracked > estimate ? 'text-orange-500' : 'text-zinc-700 dark:text-zinc-200')}>{fmtDur(tracked)}</b>}
      {tracked > 0 && estimate > 0 && <span className="text-zinc-400"> / </span>}
      {estimate > 0 && <span className="text-zinc-400">{fmtDur(estimate)}</span>}
    </span>
  );
}

// ---------- 행 ----------

const rowCls = 'group rounded-xl px-3 py-2.5 transition hover:bg-zinc-50 dark:hover:bg-zinc-800/40';

export function TaskRow({
  task: t,
  today,
  viewDate,
  tracked,
  showProject = true,
  pinnable = false,
  hideDate = false,
}: {
  task: Task;
  today: string;
  viewDate: string;
  tracked: number;
  showProject?: boolean;
  /** "+오늘" 버튼: 보고 있는 날의 할 일로 올리기 */
  pinnable?: boolean;
  /** 날짜 머리줄 아래에 있을 때: "10/18 예정" 표시 생략 */
  hideDate?: boolean;
}) {
  const projects = useProjectMap();
  const areas = useAreaMap();
  const running = useRunning();
  const [open, setOpen] = useState(false);
  const p = projects[t.project_id];
  const area = areas[p ? p.area_id : t.area_id || DAILY_AREA];
  const due = effectiveDue(t, projects);
  const late = !t.done && ((t.date && t.date < today) || (due && due < today));
  const isRunning = running?.task_id === t.id;
  const category = <Chip name={p ? p.title : (area?.name ?? '일상')} color={area?.color} />;
  const scheduledOther = t.date && t.date !== viewDate;

  const title = (
    <button onClick={() => setOpen(!open)} className="min-w-0 text-left">
      <span className={cn('text-[15px] leading-snug break-words', t.done && 'text-zinc-400 line-through decoration-zinc-300 dark:decoration-zinc-600')}>
        {t.time && <b className="mr-1.5 font-semibold text-indigo-600 tabular-nums dark:text-indigo-400">{t.time}</b>}
        {t.important && <Star className="mr-1 inline size-3.5 -translate-y-px fill-amber-400 text-amber-400" />}
        {t.title}
      </span>
      {(late || (scheduledOther && !hideDate)) && !t.done && (
        <span className={cn('ml-2 text-[11px] font-medium', late ? 'text-rose-600' : 'text-zinc-400')}>
          {late ? '밀림' : `${fmtShort(t.date)} 예정`}
        </span>
      )}
    </button>
  );

  return (
    <li className={cn(rowCls, isRunning && 'bg-rose-50/70 ring-1 ring-rose-200 dark:bg-rose-500/10 dark:ring-rose-500/30', late && !isRunning && 'bg-rose-50/30 dark:bg-rose-500/[0.04]')}>
      <div className={cn('flex items-start gap-3', GRID)}>
        <CheckButton done={t.done} color={area?.color} onClick={() => toggleTask(t)} label={t.done ? '완료 취소' : '완료'} />
        <div className="min-w-0 flex-1">
          {title}
          <MobileMeta>
            {showProject && category}
            {(t.estimate > 0 || tracked > 0) && <EstimateText estimate={t.estimate} tracked={tracked} />}
            {due && <DueText due={due} today={today} />}
          </MobileMeta>
        </div>
        <div className="hidden min-w-0 md:block">{showProject && category}</div>
        <div className="hidden md:block">
          <EstimateText estimate={t.estimate} tracked={tracked} />
        </div>
        <div className="hidden md:block">
          <DueText due={due} today={today} />
        </div>
        <div className="flex shrink-0 items-center justify-end gap-0.5">
          {pinnable && !t.done && t.date !== viewDate && (
            <button
              onClick={() => updateTask(t.id, { date: viewDate })}
              title={viewDate === today ? '오늘 할 일로' : `${fmtShort(viewDate)} 할 일로`}
              className="flex h-7 items-center gap-0.5 rounded-lg px-1.5 text-[11px] font-semibold whitespace-nowrap text-indigo-600 hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-500/10"
            >
              <CalendarPlus className="size-3.5" />
              {viewDate === today ? '오늘' : fmtShort(viewDate)}
            </button>
          )}
          {!t.done && <PlayButton running={isRunning} onStart={() => timerForTask(t)} />}
        </div>
      </div>
      {open && <TaskEditor task={t} today={today} tracked={tracked} onClose={() => setOpen(false)} />}
    </li>
  );
}

const ESTIMATES = [0, 15, 30, 45, 60, 90, 120, 180, 240];

function TaskEditor({ task: t, today, tracked, onClose }: { task: Task; today: string; tracked: number; onClose: () => void }) {
  const projects = useActiveProjects();
  const projectMap = useProjectMap();
  const areaList = useAreas();
  const lbl = 'mb-1 block text-[11px] font-medium text-zinc-400';
  const small = cn(fieldCls, 'h-8 w-full px-2 text-[13px]');
  const quick = (label: string, active: boolean, onClick: () => void) => (
    <button
      type="button"
      onClick={onClick}
      className={cn('h-6 rounded-md px-2 text-[11px] font-medium', active ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900' : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300')}
    >
      {label}
    </button>
  );
  // 완료했거나 지금 프로젝트 목록에 없는 프로젝트도 고른 상태로 보이게
  const current = projectMap[t.project_id];
  const options = current && !projects.some((p) => p.id === current.id) ? [current, ...projects] : projects;

  return (
    <div className="mt-3 rounded-xl border border-zinc-200 bg-white p-3 md:ml-9 dark:border-zinc-700 dark:bg-zinc-900">
      <input value={t.title} onChange={(e) => updateTask(t.id, { title: e.target.value })} className={cn(fieldCls, 'mb-3 h-9 w-full px-3')} aria-label="할 일 이름" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <label className="block">
          <span className={lbl}>분류</span>
          {/* 값: "p:<프로젝트>" 또는 "a:<범주>" (프로젝트 없이 범주만) */}
          <select
            value={t.project_id ? `p:${t.project_id}` : `a:${t.area_id || DAILY_AREA}`}
            onChange={(e) => {
              const [k, id] = [e.target.value.slice(0, 1), e.target.value.slice(2)];
              updateTask(t.id, k === 'p' ? { project_id: id } : { project_id: '', area_id: id });
            }}
            className={small}
          >
            <optgroup label="범주 (프로젝트 없이)">
              {areaList.map((a) => (
                <option key={a.id} value={`a:${a.id}`}>
                  {a.name}
                </option>
              ))}
            </optgroup>
            {(
              [
                ['project', '프로젝트'],
                ['steady', '꾸준히'],
              ] as const
            ).map(([kind, label]) =>
              options.some((p) => p.kind === kind) ? (
                <optgroup key={kind} label={label}>
                  {options
                    .filter((p) => p.kind === kind)
                    .map((p) => (
                      <option key={p.id} value={`p:${p.id}`}>
                        {p.title}
                      </option>
                    ))}
                </optgroup>
              ) : null,
            )}
          </select>
        </label>
        <div>
          <span className={lbl}>할 날</span>
          <input type="date" value={t.date} onChange={(e) => updateTask(t.id, { date: e.target.value })} className={small} />
          <div className="mt-1 flex gap-1">
            {quick('오늘', t.date === today, () => updateTask(t.id, { date: today }))}
            {quick('내일', t.date === addDays(today, 1), () => updateTask(t.id, { date: addDays(today, 1) }))}
            {quick('미정', t.date === '', () => updateTask(t.id, { date: '' }))}
          </div>
        </div>
        <div>
          <span className={lbl}>마감</span>
          <input type="date" value={t.due} onChange={(e) => updateTask(t.id, { due: e.target.value })} className={small} />
          <div className="mt-1 flex gap-1">{quick('없음', t.due === '', () => updateTask(t.id, { due: '' }))}</div>
        </div>
        <label className="block">
          <span className={lbl}>시각 (약속)</span>
          <input type="time" value={t.time} onChange={(e) => updateTask(t.id, { time: e.target.value })} className={small} />
        </label>
        <label className="block">
          <span className={lbl}>예상 시간</span>
          <select value={t.estimate} onChange={(e) => updateTask(t.id, { estimate: Number(e.target.value) })} className={small}>
            {(ESTIMATES.includes(t.estimate) ? ESTIMATES : [...ESTIMATES, t.estimate].sort((a, b) => a - b)).map((m) => (
              <option key={m} value={m}>
                {m ? fmtDur(m) : '모름'}
              </option>
            ))}
          </select>
        </label>
        <div>
          <span className={lbl}>중요</span>
          <button
            onClick={() => updateTask(t.id, { important: !t.important })}
            className={cn('flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[13px]', t.important ? 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300' : 'border-zinc-200 text-zinc-500 dark:border-zinc-700')}
          >
            <Star className={cn('size-3.5', t.important && 'fill-amber-400 text-amber-400')} /> {t.important ? '중요' : '보통'}
          </button>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2 border-t border-zinc-100 pt-3 text-xs text-zinc-400 dark:border-zinc-800">
        {tracked > 0 ? <span>지금까지 {fmtDur(tracked)} 기록</span> : <span>▶ 를 누르면 시간이 기록돼요</span>}
        <button onClick={() => deleteTask(t.id)} className="ml-auto flex items-center gap-1 rounded-lg px-2 py-1 text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10">
          <Trash2 className="size-3.5" /> 삭제
        </button>
        <button onClick={onClose} className="rounded-lg px-2 py-1 font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800">
          닫기
        </button>
      </div>
    </div>
  );
}

export function HabitRow({ habit: h, date, logs, streakDays }: { habit: Habit; date: string; logs: Set<string>; streakDays: number }) {
  const areas = useAreaMap();
  const running = useRunning();
  const area = areas[h.area_id];
  const done = logs.has(logId(h.id, date));
  const isRunning = running?.habit_id === h.id;
  const fire = streakDays > 0 && (
    <span className="inline-flex items-center gap-0.5 text-[13px] font-semibold text-orange-500 tabular-nums">
      <Flame className="size-3.5" />
      {streakDays}
    </span>
  );
  return (
    <li className={cn(rowCls, isRunning && 'bg-rose-50/70 ring-1 ring-rose-200 dark:bg-rose-500/10 dark:ring-rose-500/30')}>
      <div className={cn('flex items-start gap-3', GRID)}>
        <CheckButton done={done} color={area?.color} onClick={() => toggleHabit(h.id, date)} label={done ? '완료 취소' : '완료'} />
        <div className="min-w-0 flex-1">
          <span className={cn('text-[15px] leading-snug break-words', done && 'text-zinc-400 line-through decoration-zinc-300 dark:decoration-zinc-600')}>
            {h.time && <b className="mr-1.5 font-semibold text-indigo-600 tabular-nums dark:text-indigo-400">{h.time}</b>}
            {h.title}
          </span>
          <span className="ml-2 inline-flex items-center gap-0.5 text-[11px] font-medium text-zinc-400">
            <Repeat className="size-3" />
            {repeatLabel(h.weekdays)}
          </span>
          <MobileMeta>
            <Chip name={area?.name} color={area?.color} />
            {!!h.estimate && <EstimateText estimate={h.estimate} tracked={0} />}
            {fire}
          </MobileMeta>
        </div>
        <div className="hidden min-w-0 md:block">
          <Chip name={area?.name} color={area?.color} />
        </div>
        <div className="hidden md:block">
          <EstimateText estimate={h.estimate ?? 0} tracked={0} />
        </div>
        <div className="hidden md:block">{fire || <span className="text-zinc-300 dark:text-zinc-600">–</span>}</div>
        <div className="flex shrink-0 justify-end">
          <PlayButton running={isRunning} onStart={() => timerForHabit(h)} />
        </div>
      </div>
    </li>
  );
}

/** 지금 향하는 성과 목표 한 줄: "→ HSK 4급 · D-61" */
export function MilestoneHint({ p, today }: { p: Project; today: string }) {
  const m = activeMilestone(p);
  if (!m) return null;
  return (
    <span className="ml-2 text-xs text-zinc-500">
      → {m.title}
      {m.due && <span className={cn('ml-1 font-semibold tabular-nums', diffDays(m.due, today) < 0 ? 'text-rose-600' : 'text-zinc-400')}>{dDay(m.due, today)}</span>}
    </span>
  );
}

/** 꾸준히: 이번 주 기록 / 목표 */
export function SteadyRow({ project: p, today, weekMinutes }: { project: Project; today: string; weekMinutes: number }) {
  const areas = useAreaMap();
  const running = useRunning();
  const area = areas[p.area_id];
  const target = targetFor(p, weekStart(today)) * 60;
  const isRunning = running?.project_id === p.id && !running.task_id;
  const ratio = target ? Math.min(weekMinutes / target, 1) : 0;
  const progress = (
    <div className="flex min-w-0 items-center gap-2">
      <div className="h-2 min-w-16 flex-1 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
        <div className="h-full rounded-full transition-all" style={{ width: `${ratio * 100}%`, background: area?.color ?? '#a1a1aa' }} />
      </div>
      <span className="text-[13px] whitespace-nowrap tabular-nums">
        <b className="font-semibold">{fmtDur(weekMinutes)}</b>
        <span className="text-zinc-400"> / {target ? fmtDur(target) : '목표 없음'}</span>
      </span>
    </div>
  );
  return (
    <li className={cn(rowCls, isRunning && 'bg-rose-50/70 ring-1 ring-rose-200 dark:bg-rose-500/10 dark:ring-rose-500/30')}>
      <div className={cn('flex items-center gap-3', GRID)}>
        <span className="grid size-[22px] shrink-0 place-items-center">
          <span className="size-2.5 rounded-full" style={{ background: area?.color }} />
        </span>
        <div className="min-w-0 flex-1">
          <a href={`#projects/${p.id}`} className="text-[15px] leading-snug hover:underline">
            {p.title}
          </a>
          <MilestoneHint p={p} today={today} />
          <div className="mt-1.5 md:hidden">{progress}</div>
        </div>
        <div className="hidden min-w-0 md:block">
          <Chip name={area?.name} color={area?.color} />
        </div>
        <div className="hidden md:col-span-2 md:block">{progress}</div>
        <div className="flex shrink-0 justify-end">
          <PlayButton running={isRunning} onStart={() => timerForProject(p)} />
        </div>
      </div>
    </li>
  );
}

// ---------- 빠른 입력 ----------

export function QuickAdd({ defaultDate, projectId, placeholder }: { defaultDate?: string; projectId?: string; placeholder?: string }) {
  const [text, setText] = useState('');
  const [made, setMade] = useState<string | null>(null);
  const projects = useActiveProjects();
  const projectMap = useProjectMap();
  const areaList = useAreas();
  const areaMap = useAreaMap();
  const today = useToday();
  const parsed = text.trim() ? parseTask(text, projects, today, areaList) : null;
  const pid = parsed?.project_id ?? projectId;
  const chips: string[] = [];
  if (parsed) {
    chips.push(pid ? `📁 ${projectMap[pid]?.title}` : `● ${areaMap[parsed.area_id ?? DAILY_AREA]?.name ?? '일상'}`);
    if (parsed.repeat) {
      chips.push(`🔁 ${repeatLabel(parsed.repeat)} 반복`);
    } else {
      // 날짜를 안 적으면 오늘(보고 있는 날) 시작 · 그날 마감
      const date = parsed.date ?? defaultDate ?? today;
      chips.push(`📅 ${fmtShort(date)}`);
      chips.push(`⚑ 마감 ${fmtShort(parsed.due ?? date)}`);
    }
    if (parsed.time) chips.push(`🕑 ${parsed.time}`);
    if (parsed.estimate) chips.push(`⏱ ${fmtDur(parsed.estimate)}`);
    if (parsed.important && !parsed.repeat) chips.push('★ 중요');
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const r = addTaskFromText(text, { defaultDate, projectId });
        if (!r) return;
        setText('');
        setMade(r.kind === 'habit' ? '반복 할 일로 만들었어요 — 설정에서 고칠 수 있어요' : null);
        if (r.kind === 'habit') setTimeout(() => setMade(null), 3000);
      }}
    >
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={placeholder ?? '할 일 추가 — 예: 자소서 제출 #취업준비 내일 1h !'}
        className={cn(fieldCls, 'h-11 w-full min-w-0 rounded-xl px-4 text-[15px] shadow-[0_1px_2px_rgba(0,0,0,0.03)]')}
      />
      <div className="mt-1.5 flex min-h-5 min-w-0 flex-wrap gap-1.5 px-1 text-[11px] text-zinc-500">
        {parsed ? (
          chips.map((c) => (
            <span key={c} className="rounded-md bg-zinc-100 px-1.5 py-0.5 dark:bg-zinc-800">
              {c}
            </span>
          ))
        ) : made ? (
          <span className="font-medium text-emerald-600">{made}</span>
        ) : (
          <span className="min-w-0 text-zinc-400">
            #프로젝트·#범주 · 내일/금요일/10/19 · 14:00 · 1h · ~10/19(마감) · ! · 매일/월수금(반복) — 날짜 없으면 오늘 시작·오늘 마감
          </span>
        )}
      </div>
    </form>
  );
}
