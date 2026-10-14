import { useState } from 'react';
import { Check, Flag, Trash2 } from 'lucide-react';
import { activeMilestone, addMilestone, deleteMilestone, toggleMilestone, updateCurrent, updateMilestone } from '../actions';
import { useNow, useSessions, useToday } from '../hooks';
import { addDays, dDay, diffDays, fmtDur, fmtShort, fromKey } from '../lib/date';
import { overlapMin } from '../lib/stats';
import type { Milestone, Project } from '../lib/types';
import { Button, cn, fieldCls } from './ui';

/**
 * 성과: 지금 상태 → 중간 목표들(기한) → 최종 목표.
 * 목표마다 "시작한 날부터 (달성한 날까지) 이 프로젝트에 쓴 시간"을 붙여서
 * 시간을 들인 만큼 성과가 났는지 보이게 한다.
 */
export function Outcomes({ p, color }: { p: Project; color: string }) {
  const today = useToday();
  const sessions = useSessions();
  const now = useNow();
  const list = p.milestones ?? [];
  const active = activeMilestone(p);

  const invested = (m: Milestone) => {
    const from = fromKey(m.start).getTime();
    const to = m.done && m.done_on ? fromKey(addDays(m.done_on, 1)).getTime() : now;
    return sessions.filter((s) => s.project_id === p.id).reduce((n, s) => n + overlapMin(s, from, to, now), 0);
  };

  return (
    <section className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
      <h3 className="mb-3 flex items-center gap-1.5 text-sm font-bold">
        <Flag className="size-4" style={{ color }} /> 성과 목표
      </h3>

      <label className="block">
        <span className="mb-1 flex items-baseline justify-between text-[11px] font-medium text-zinc-400">
          지금 내 상태
          {p.current_on && <span>{fmtShort(p.current_on)} 기준</span>}
        </span>
        <input
          value={p.current ?? ''}
          onChange={(e) => updateCurrent(p, e.target.value)}
          placeholder="예: HSK 3급 수준, 단어 600개 / 보고서 초안 50%"
          className={cn(fieldCls, 'h-9 w-full px-3')}
        />
      </label>

      <ol className="relative mt-4 space-y-1">
        {list.length > 0 && <span className="absolute top-3 bottom-3 left-[10px] w-px bg-zinc-200 dark:bg-zinc-700" />}
        {list.map((m) => (
          <MilestoneRow key={m.id} p={p} m={m} isActive={m.id === active?.id} invested={invested(m)} today={today} color={color} />
        ))}
      </ol>

      <AddMilestone p={p} first={list.length === 0} />
    </section>
  );
}

function MilestoneRow({
  p,
  m,
  isActive,
  invested,
  today,
  color,
}: {
  p: Project;
  m: Milestone;
  isActive: boolean;
  invested: number;
  today: string;
  color: string;
}) {
  // 기한까지 기간이 얼마나 지났나
  const total = m.due ? diffDays(m.due, m.start) : 0;
  const elapsed = Math.min(Math.max(diffDays(today, m.start), 0), Math.max(total, 0));
  const late = !m.done && m.due && m.due < today;
  const waiting = !m.done && !isActive; // 앞 목표를 달성하면 시작

  return (
    <li className={cn('group relative flex gap-3 rounded-xl py-2 pr-2', isActive && '-mx-2 bg-zinc-50 px-2 dark:bg-zinc-800/50')}>
      <button
        onClick={() => toggleMilestone(p, m)}
        aria-label={m.done ? '달성 취소' : '달성'}
        className={cn(
          'relative z-10 mt-0.5 grid size-[21px] shrink-0 place-items-center rounded-full border-2 bg-white transition dark:bg-zinc-900',
          m.done ? 'border-transparent text-white' : isActive ? '' : 'border-zinc-300 dark:border-zinc-600',
        )}
        style={m.done ? { background: color } : isActive ? { borderColor: color } : undefined}
      >
        {m.done ? <Check className="size-3" strokeWidth={3.5} /> : isActive && <span className="size-2 rounded-full" style={{ background: color }} />}
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <input
            value={m.title}
            onChange={(e) => updateMilestone(p, m.id, { title: e.target.value })}
            className={cn(
              'min-w-0 flex-1 rounded bg-transparent text-[15px] font-semibold focus:bg-white focus:outline-none dark:focus:bg-zinc-900',
              m.done && 'text-zinc-400',
            )}
            aria-label="목표"
          />
          {m.final && <span className="rounded bg-amber-100 px-1.5 text-[11px] font-bold text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">최종</span>}
          {isActive && <span className="text-[11px] font-semibold" style={{ color }}>진행 중</span>}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
          <span className="tabular-nums">
            {waiting ? '대기 — 앞 목표를 이루면 시작' : `${fmtShort(m.start)} 시작${m.done && m.done_on ? ` → ${fmtShort(m.done_on)} 달성` : ''}`}
          </span>
          {!m.done && (
            <label className="flex items-center gap-1">
              기한
              <input
                type="date"
                value={m.due}
                onChange={(e) => updateMilestone(p, m.id, { due: e.target.value })}
                className="rounded bg-transparent text-xs tabular-nums focus:outline-none"
              />
              {m.due && <b className={cn('tabular-nums', late ? 'text-rose-600' : 'text-zinc-700 dark:text-zinc-200')}>{dDay(m.due, today)}</b>}
            </label>
          )}
          {!waiting && (
            <span>
              투입 <b className="font-semibold text-zinc-700 tabular-nums dark:text-zinc-200">{fmtDur(invested)}</b>
            </span>
          )}
        </div>
        {isActive && total > 0 && (
          <div className="mt-1.5 flex items-center gap-2 text-[11px] text-zinc-400">
            <div className="h-1 w-32 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
              <div className={cn('h-full rounded-full', late ? 'bg-rose-500' : 'bg-zinc-400')} style={{ width: `${(elapsed / total) * 100}%` }} />
            </div>
            기간 {Math.round((elapsed / total) * 100)}% 지남
          </div>
        )}
      </div>
      <div className="flex shrink-0 items-start gap-0.5 opacity-100 md:opacity-0 md:group-hover:opacity-100">
        <button
          title={m.final ? '최종 목표 해제' : '최종 목표로'}
          onClick={() => updateMilestone(p, m.id, { final: !m.final })}
          className="rounded px-1.5 py-1 text-[11px] text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800"
        >
          최종
        </button>
        <button aria-label="목표 삭제" onClick={() => deleteMilestone(p, m.id)} className="rounded p-1 text-zinc-400 hover:text-rose-500">
          <Trash2 className="size-3.5" />
        </button>
      </div>
    </li>
  );
}

function AddMilestone({ p, first }: { p: Project; first: boolean }) {
  const [title, setTitle] = useState('');
  const [due, setDue] = useState('');
  const [final, setFinal] = useState(false);
  return (
    <form
      className="mt-3 flex flex-wrap items-center gap-2 border-t border-zinc-100 pt-3 dark:border-zinc-800"
      onSubmit={(e) => {
        e.preventDefault();
        if (!title.trim()) return;
        addMilestone(p, title, due, final);
        setTitle('');
        setDue('');
        setFinal(false);
      }}
    >
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={first ? '첫 목표 — 예: HSK 4급 취득' : '다음 목표 — 예: HSK 5급 취득'}
        className={cn(fieldCls, 'h-9 min-w-40 flex-1 px-3')}
      />
      <input type="date" value={due} onChange={(e) => setDue(e.target.value)} className={cn(fieldCls, 'h-9 px-2 text-sm')} aria-label="기한" title="기한 (없어도 돼요)" />
      <label className="flex items-center gap-1.5 text-xs text-zinc-500">
        <input type="checkbox" checked={final} onChange={(e) => setFinal(e.target.checked)} className="accent-zinc-900" />
        최종
      </label>
      <Button type="submit" variant="primary" className="h-9">
        추가
      </Button>
    </form>
  );
}
