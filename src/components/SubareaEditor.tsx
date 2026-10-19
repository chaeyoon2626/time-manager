import { useMemo, useState } from 'react';
import { Archive, ChevronDown, Layers, Plus, Trash2 } from 'lucide-react';
import { addSubarea, deleteSubarea, ensureRoutineTasks, subareaDue, updateSubarea } from '../actions';
import { useNow, useSessions, useToday } from '../hooks';
import { addDays, fmtDur, fromKey, weekDays, weekStart } from '../lib/date';
import { overlapMin } from '../lib/stats';
import type { Project, Subarea } from '../lib/types';
import { useStore } from '../store';
import { DayPicker, repeatLabel } from './TaskList';
import { Button, cn, fieldCls } from './ui';

const ESTIMATES = [0, 10, 15, 20, 30, 45, 60, 90, 120, 180];

const cadenceLabel = (sa: Subarea) => (sa.cadence === 'none' ? '가끔' : repeatLabel(sa.weekdays));

/** 프로젝트·꾸준히 화면의 세부 영역 목록: 주기·방식·이번 주 시간·실행 */
export function SubareaSection({ p }: { p: Project }) {
  const subareas = useStore((s) => s.data.subareas);
  const tasks = useStore((s) => s.data.tasks);
  const sessions = useSessions();
  const now = useNow();
  const today = useToday();
  const [name, setName] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);

  const list = Object.values(subareas)
    .filter((sa) => !sa.deleted && !sa.archived && sa.project_id === p.id)
    .sort((a, b) => a.sort - b.sort);
  const archived = Object.values(subareas).filter((sa) => !sa.deleted && sa.archived && sa.project_id === p.id);

  // 이번 주: 세부 영역별 기록 시간(할 일을 통해), 해야 하는 날 중 한 날 / 쉰 날
  const stats = useMemo(() => {
    const ws = weekStart(today);
    const from = fromKey(ws).getTime();
    const to = fromKey(addDays(ws, 7)).getTime();
    const minutes: Record<string, number> = {};
    for (const s of sessions) {
      const sid = tasks[s.task_id]?.subarea_id;
      if (!sid) continue;
      minutes[sid] = (minutes[sid] ?? 0) + overlapMin(s, from, to, now);
    }
    const days = weekDays(today).filter((d) => d <= today);
    const exec: Record<string, { due: number; done: number; skipped: number }> = {};
    for (const sa of list) {
      const due = days.filter((d) => subareaDue(sa, d));
      const doneDays = new Set(Object.values(tasks).filter((t) => !t.deleted && t.done && t.subarea_id === sa.id).map((t) => t.date));
      exec[sa.id] = {
        due: due.length,
        done: due.filter((d) => doneDays.has(d)).length,
        skipped: due.filter((d) => (sa.skips ?? []).includes(d)).length,
      };
    }
    return { minutes, exec };
  }, [sessions, tasks, today, now, list]);

  const max = Math.max(...list.map((sa) => stats.minutes[sa.id] ?? 0), 30);

  return (
    <div className="mt-5">
      <div className="mb-1 flex items-baseline gap-2 px-1">
        <Layers className="size-3.5 translate-y-0.5 text-zinc-400" />
        <h3 className="text-sm font-bold">세부 영역</h3>
        <span className="text-[11px] text-zinc-400">정한 요일마다 오늘 할 일에 떠요 · 고정 = 매번 같은 것, 그날 정하기 = 그날 고르기</span>
      </div>

      {list.length === 0 && (
        <p className="px-1 py-2 text-xs text-zinc-400">
          {p.kind === 'steady' ? '예: 단어(매일·고정 "단어 50개"), 듣기(월수금·그날 정하기), 독해(화목)' : '예: 자소서, 면접, 자격증'}
        </p>
      )}

      <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
        {list.map((sa) => {
          const m = stats.minutes[sa.id] ?? 0;
          const ex = stats.exec[sa.id];
          const open = openId === sa.id;
          return (
            <li key={sa.id} className="py-1">
              <button onClick={() => setOpenId(open ? null : sa.id)} className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-[15px] font-medium">{sa.name || <span className="text-zinc-400">(이름 없음)</span>}</span>
                    <span className="text-xs text-zinc-400">
                      {cadenceLabel(sa)} · {sa.mode === 'fixed' ? `고정: ${sa.fixed_title || sa.name}` : '그날 정하기'}
                      {sa.estimate > 0 && ` · ${fmtDur(sa.estimate)}`}
                    </span>
                  </div>
                  <div className="mt-1.5 flex items-center gap-2">
                    <div className="h-1.5 w-28 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                      <div className="h-full rounded-full bg-zinc-500" style={{ width: `${(m / max) * 100}%` }} />
                    </div>
                    <span className="text-[11px] text-zinc-500 tabular-nums">
                      이번 주 <b className="font-semibold">{fmtDur(m)}</b>
                      {ex && ex.due > 0 && (
                        <>
                          {' '}
                          · 실행 {ex.done}/{ex.due}일{ex.skipped > 0 && ` · 쉼 ${ex.skipped}`}
                        </>
                      )}
                    </span>
                  </div>
                </div>
                <ChevronDown className={cn('size-4 shrink-0 text-zinc-400 transition', open && 'rotate-180')} />
              </button>
              {open && <SubareaForm sa={sa} />}
            </li>
          );
        })}
      </ul>

      <form
        className="mt-2 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          const id = addSubarea(p.id, name, p.kind === 'steady' ? { cadence: 'days', weekdays: [] } : {});
          setName('');
          setOpenId(id);
        }}
      >
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="새 세부 영역 (예: 듣기)" className={cn(fieldCls, 'h-9 min-w-0 flex-1 px-3')} />
        <Button type="submit" variant="outline" className="h-9 shrink-0">
          <Plus className="size-4" /> 추가
        </Button>
      </form>

      {archived.length > 0 && (
        <details className="mt-2 px-1">
          <summary className="cursor-pointer text-xs text-zinc-400">보관한 세부 영역 {archived.length}개</summary>
          <ul className="mt-1 space-y-1 text-sm">
            {archived.map((sa) => (
              <li key={sa.id} className="flex items-center gap-2 text-zinc-500">
                {sa.name || '(이름 없음)'}
                <button onClick={() => updateSubarea(sa.id, { archived: false })} className="text-xs underline">
                  되살리기
                </button>
                <span className="ml-auto">
                  <DeleteButton sa={sa} />
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function SubareaForm({ sa }: { sa: Subarea }) {
  const today = useToday();
  const lbl = 'mb-1 block text-[11px] font-medium text-zinc-400';
  const small = cn(fieldCls, 'h-8 w-full px-2 text-[13px]');
  const seg = (active: boolean) =>
    cn('h-7 rounded-md px-2.5 text-xs font-medium', active ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900' : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300');
  // 고정 세부 영역은 바꾸면 오늘 할 일도 바로 맞춘다
  const update = (patch: Partial<Subarea>) => {
    updateSubarea(sa.id, patch);
    setTimeout(() => ensureRoutineTasks(today), 0);
  };
  return (
    <div className="mx-2 mb-2 space-y-3 rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-900">
      <label className="block">
        <span className={lbl}>이름</span>
        <input value={sa.name} onChange={(e) => updateSubarea(sa.id, { name: e.target.value })} className={small} />
      </label>
      <div>
        <span className={lbl}>주기</span>
        <div className="flex flex-wrap items-center gap-1.5">
          <button type="button" className={seg(sa.cadence === 'none')} onClick={() => update({ cadence: 'none' })}>
            가끔
          </button>
          <span className="text-[11px] text-zinc-400">또는</span>
          <div className={cn(sa.cadence === 'none' && 'opacity-50')}>
            <DayPicker value={sa.weekdays} onChange={(v) => update({ cadence: 'days', weekdays: v })} />
          </div>
        </div>
        {sa.cadence === 'none' && <p className="mt-1 text-[11px] text-zinc-400">가끔 = 오늘 목록에 자동으로 뜨지 않아요. 할 일에 이 세부 영역을 골라 쓰면 돼요.</p>}
      </div>
      <div>
        <span className={lbl}>방식</span>
        <div className="flex gap-1.5">
          <button type="button" className={seg(sa.mode === 'choose')} onClick={() => update({ mode: 'choose' })}>
            그날 정하기
          </button>
          <button type="button" className={seg(sa.mode === 'fixed')} onClick={() => update({ mode: 'fixed', fixed_title: sa.fixed_title || sa.name })}>
            고정
          </button>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        {sa.mode === 'fixed' && (
          <label className="col-span-3 block">
            <span className={lbl}>매번 할 것</span>
            <input value={sa.fixed_title} onChange={(e) => updateSubarea(sa.id, { fixed_title: e.target.value })} placeholder="예: 단어 50개" className={small} />
          </label>
        )}
        <label className="block">
          <span className={lbl}>예상 시간</span>
          <select value={sa.estimate} onChange={(e) => updateSubarea(sa.id, { estimate: Number(e.target.value) })} className={small}>
            {(ESTIMATES.includes(sa.estimate) ? ESTIMATES : [...ESTIMATES, sa.estimate].sort((a, b) => a - b)).map((m) => (
              <option key={m} value={m}>
                {m ? fmtDur(m) : '모름'}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={lbl}>시각</span>
          <input type="time" value={sa.time} onChange={(e) => updateSubarea(sa.id, { time: e.target.value })} className={small} />
        </label>
      </div>
      <div className="flex items-center justify-end gap-1 border-t border-zinc-100 pt-2.5 dark:border-zinc-800">
        <Button className="h-8 text-xs text-zinc-500" title="목록에서 숨기기 (되살릴 수 있어요)" onClick={() => updateSubarea(sa.id, { archived: true })}>
          <Archive className="size-3.5" /> 보관
        </Button>
        <DeleteButton sa={sa} />
      </div>
    </div>
  );
}

function DeleteButton({ sa }: { sa: Subarea }) {
  return (
    <Button
      variant="danger"
      className="h-8 text-xs"
      onClick={() =>
        confirm(`세부 영역 '${sa.name || '(이름 없음)'}'을(를) 지울까요?\n아직 안 한 오늘·앞으로의 할 일도 같이 지워져요. 끝낸 할 일과 잰 시간은 남아요.`) &&
        deleteSubarea(sa)
      }
    >
      <Trash2 className="size-3.5" /> 삭제
    </Button>
  );
}
