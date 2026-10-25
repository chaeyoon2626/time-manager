import { useEffect, useState } from 'react';
import { Clock, X } from 'lucide-react';
import { endTimerAt, runningSession, startTimerNow } from '../actions';
import { useProjectMap } from '../hooks';
import { fmtDur, hhmm, todayKey, toKey } from '../lib/date';
import { useStore } from '../store';
import { closeTimerPrompt, getLastActive, markActive, openTimerPrompt, useTimerPrompt } from '../timerPrompt';
import { Button, cn, fieldCls } from './ui';

/** 한동안 이만큼 이상 앱을 안 봤는데 타이머가 켜져 있으면 물어본다 */
const AWAY_MS = 60 * 60_000;

const pad = (n: number) => String(n).padStart(2, '0');
/** ms → <input type="datetime-local"> 값 */
const toLocalInput = (ms: number) => {
  const d = new Date(ms);
  return `${toKey(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
/** "어제 20:10", "오늘 09:00", "10/23 20:10" */
const when = (ms: number) => {
  const d = new Date(ms);
  const k = toKey(d);
  const today = todayKey();
  const y = new Date();
  y.setDate(y.getDate() - 1);
  const prefix = k === today ? '오늘' : k === toKey(y) ? '어제' : `${d.getMonth() + 1}/${d.getDate()}`;
  return `${prefix} ${hhmm(d)}`;
};

/**
 * 앱을 다시 볼 때마다: 자리를 비운 사이(1시간 이상) 타이머가 켜져 있었으면 확인창을 띄운다.
 * 이 기기에서 앱을 마지막으로 본 시각은 1분마다, 그리고 숨길 때 기록한다.
 */
export function useAwayCheck() {
  const hydrated = useStore((s) => s.hydrated);
  useEffect(() => {
    if (!hydrated) return;
    const check = () => {
      const prev = getLastActive();
      const run = runningSession();
      if (run && prev && Date.now() - prev >= AWAY_MS && Date.parse(run.start) < prev && !useTimerPrompt.getState().prompt) {
        openTimerPrompt({ reason: 'away', sessionId: run.id, awaySince: prev });
      }
      markActive();
    };
    check();
    const onVis = () => (document.visibilityState === 'visible' ? check() : markActive());
    document.addEventListener('visibilitychange', onVis);
    const t = setInterval(() => document.visibilityState === 'visible' && markActive(), 60_000);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      clearInterval(t);
    };
  }, [hydrated]);
}

/** "타이머를 언제 끝냈나요?" */
export function TimerFixDialog() {
  const prompt = useTimerPrompt((s) => s.prompt);
  const run = useStore((s) => (prompt ? s.data.sessions[prompt.sessionId] : undefined));
  const projects = useProjectMap();
  const [custom, setCustom] = useState<string | null>(null);

  useEffect(() => setCustom(null), [prompt]);
  // 다른 기기에서 이미 끈 게 들어오면 닫는다
  useEffect(() => {
    if (prompt && (!run || run.deleted || run.end)) {
      if (prompt.reason === 'start' && prompt.next) startTimerNow(prompt.next);
      closeTimerPrompt();
    }
  }, [prompt, run]);

  if (!prompt || !run || run.end) return null;
  const now = Date.now();
  const start = Date.parse(run.start);
  const p = projects[run.project_id];
  const name = run.title && p && run.title !== p.title ? `${p.title} · ${run.title}` : run.title || p?.title || '타이머';

  /** 끝낸 뒤: 새 타이머를 켜려던 거면 이어서 켠다 */
  const finish = (endMs: number | null) => {
    if (endMs !== null) endTimerAt(run.id, new Date(endMs).toISOString());
    if (prompt.reason === 'start' && prompt.next) startTimerNow(prompt.next);
    closeTimerPrompt();
  };
  const away = prompt.reason === 'away' ? Math.max(prompt.awaySince ?? start, start + 60_000) : null;
  const customMs = custom ? new Date(custom).getTime() : NaN;
  const customOk = Number.isFinite(customMs) && customMs > start && customMs <= now;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-3 sm:items-center" role="dialog" aria-modal="true" aria-label="타이머 끝난 시각">
      <div className="anim-fade absolute inset-0 bg-zinc-950/30 backdrop-blur-[2px]" />
      <div className="anim-sheet relative w-full max-w-md rounded-3xl bg-white p-5 shadow-2xl dark:bg-zinc-900">
        <button
          aria-label="닫기"
          onClick={() => (prompt.reason === 'away' ? finish(null) : closeTimerPrompt())}
          className="absolute top-4 right-4 rounded-lg p-1 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
        >
          <X className="size-5" />
        </button>
        <div className="flex items-center gap-2 text-amber-600">
          <Clock className="size-5" />
          <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
            {prompt.reason === 'away' ? '자리를 비운 사이 타이머가 켜져 있었어요' : `타이머가 ${fmtDur((now - start) / 60_000)}째 켜져 있어요`}
          </h2>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
          <b>{name}</b> — {when(start)}부터
          {prompt.reason === 'away' && away && (
            <>
              <br />이 기기에서 앱을 마지막으로 본 건 <b>{when(away)}</b>이에요.
            </>
          )}
          {prompt.reason === 'start' && prompt.next && (
            <>
              <br />새 타이머 <b>{prompt.next.title || '기록'}</b>를 켜기 전에, 언제 끝났는지 알려주세요.
            </>
          )}
        </p>

        <div className="mt-4 space-y-2">
          {away && (
            <Button variant="primary" className="h-10 w-full justify-start px-4 text-sm" onClick={() => finish(away)}>
              {when(away)}에 끝났어요 <span className="ml-auto font-normal opacity-70">{fmtDur((away - start) / 60_000)}</span>
            </Button>
          )}
          <Button
            variant={away ? 'outline' : 'primary'}
            className="h-10 w-full justify-start px-4 text-sm"
            onClick={() => (prompt.reason === 'away' ? finish(null) : finish(now))}
          >
            {prompt.reason === 'away' ? '지금까지 하고 있어요' : '지금 끝내기'}
            <span className="ml-auto font-normal opacity-70">{fmtDur((now - start) / 60_000)}</span>
          </Button>
          {custom === null ? (
            <Button variant="outline" className="h-10 w-full justify-start px-4 text-sm" onClick={() => setCustom(toLocalInput(away ?? Math.min(start + 3_600_000, now)))}>
              다른 시각에 끝났어요…
            </Button>
          ) : (
            <div className="flex gap-2 rounded-xl border border-zinc-200 p-2 dark:border-zinc-700">
              <input
                type="datetime-local"
                value={custom}
                min={toLocalInput(start)}
                max={toLocalInput(now)}
                onChange={(e) => setCustom(e.target.value)}
                className={cn(fieldCls, 'h-9 min-w-0 flex-1 px-2 text-sm')}
                aria-label="끝난 시각"
              />
              <Button variant="primary" className="h-9 shrink-0" disabled={!customOk} onClick={() => finish(customMs)}>
                {customOk ? `${fmtDur((customMs - start) / 60_000)}로` : '시각 확인'}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
