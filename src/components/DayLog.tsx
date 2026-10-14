import { useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { addSession, deleteSession, updateSession } from '../actions';
import { useActiveProjects, useAreaMap, useAreas, useNow, useProjectMap, useSessions } from '../hooks';
import { atTime, dayBounds, fmtDur, hhmm } from '../lib/date';
import { overlapMin, sumSessions } from '../lib/stats';
import type { Session } from '../lib/types';
import { useStore } from '../store';
import { Button, Card, cn, fieldCls } from './ui';

/** 그날 잰 시간: 하루 막대 + 기록 목록(고치기·지우기) + 직접 추가 */
export function DayLog({ date }: { date: string }) {
  const sessions = useSessions();
  const areas = useAreaMap();
  const areaList = useAreas();
  const projects = useProjectMap();
  const now = useNow();
  const { startHour, endHour } = useStore((s) => s.settings);
  const [from, to] = dayBounds(date);
  const [adding, setAdding] = useState(false);

  const list = useMemo(
    () => sessions.filter((s) => overlapMin(s, from, to, now) > 0).sort((a, b) => a.start.localeCompare(b.start)),
    [sessions, from, to, now],
  );
  const sum = sumSessions(list, from, to, now);

  // 막대: startHour~endHour 구간을 100%로
  const barFrom = from + startHour * 3_600_000;
  const barTo = from + endHour * 3_600_000;
  const span = barTo - barFrom;
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
      <div className="relative h-7 overflow-hidden rounded-lg bg-zinc-100 dark:bg-zinc-800">
        {list.map((s) => {
          const a = Math.max(Date.parse(s.start), barFrom);
          const b = Math.min(s.end ? Date.parse(s.end) : now, barTo);
          if (b <= a) return null;
          return (
            <div
              key={s.id}
              title={`${nameOf(s)} ${hhmm(new Date(s.start))}–${s.end ? hhmm(new Date(s.end)) : '지금'}`}
              className={cn('absolute inset-y-0', !s.end && 'animate-pulse')}
              style={{ left: `${((a - barFrom) / span) * 100}%`, width: `${Math.max(((b - a) / span) * 100, 0.6)}%`, background: colorOf(s) }}
            />
          );
        })}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-zinc-400 tabular-nums">
        {Array.from({ length: 5 }, (_, i) => Math.round(startHour + ((endHour - startHour) * i) / 4)).map((h) => (
          <span key={h}>{h}시</span>
        ))}
      </div>

      {Object.keys(sum.byArea).length > 0 && (
        <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs">
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
        <AddSession date={date} onDone={() => setAdding(false)} />
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

function AddSession({ date, onDone }: { date: string; onDone: () => void }) {
  const projects = useActiveProjects();
  const areas = useAreas();
  // value: "p:<프로젝트 id>" 또는 "a:<범주 id>"
  const [target, setTarget] = useState(projects[0] ? `p:${projects[0].id}` : areas[0] ? `a:${areas[0].id}` : '');
  const [start, setStart] = useState('09:00');
  const [end, setEnd] = useState('10:00');
  const [title, setTitle] = useState('');
  const sel = cn(fieldCls, 'h-8 px-2 text-[13px]');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!target || end <= start) return;
    const [kind, id] = [target.slice(0, 1), target.slice(2)];
    const p = kind === 'p' ? projects.find((x) => x.id === id) : undefined;
    addSession({
      task_id: '',
      habit_id: '',
      project_id: p?.id ?? '',
      area_id: p?.area_id ?? (kind === 'a' ? id : ''),
      title: title.trim() || p?.title || '',
      start: atTime(date, start),
      end: atTime(date, end),
    });
    onDone();
  };

  return (
    <form onSubmit={submit} className="mt-2 space-y-2 rounded-xl border border-zinc-200 p-3 dark:border-zinc-700">
      <select value={target} onChange={(e) => setTarget(e.target.value)} className={cn(sel, 'w-full')} aria-label="무엇을 했나">
        {projects.length > 0 && (
          <optgroup label="프로젝트 · 꾸준히">
            {projects.map((p) => (
              <option key={p.id} value={`p:${p.id}`}>
                {p.title}
              </option>
            ))}
          </optgroup>
        )}
        <optgroup label="범주만">
          {areas.map((a) => (
            <option key={a.id} value={`a:${a.id}`}>
              {a.name}
            </option>
          ))}
        </optgroup>
      </select>
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="무엇을 했나요 (선택)" className={cn(sel, 'w-full')} />
      <div className="flex items-center gap-2 text-sm">
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
