import { create } from 'zustand';
import type { TimerTarget } from './actions';

/**
 * "언제 끝났나요?" 확인창 상태 (기기 안에서만, 저장하지 않음)
 *  - away : 한동안 앱을 안 본 사이 타이머가 켜져 있었다
 *  - stop : 오래 켜진 타이머를 끄려 한다
 *  - start: 오래 켜진 타이머가 있는데 다른 타이머를 켜려 한다 (next = 켜려던 것)
 */
export type TimerPrompt = {
  reason: 'away' | 'stop' | 'start';
  sessionId: string;
  awaySince?: number; // away: 이 기기에서 앱을 마지막으로 본 시각(ms)
  next?: TimerTarget;
};

export const useTimerPrompt = create<{ prompt: TimerPrompt | null }>(() => ({ prompt: null }));
export const openTimerPrompt = (p: TimerPrompt) => useTimerPrompt.setState({ prompt: p });
export const closeTimerPrompt = () => useTimerPrompt.setState({ prompt: null });

// ---------- 이 기기에서 앱을 마지막으로 본 시각 ----------

const KEY = 'tm:lastActive';

export function getLastActive(): number | null {
  try {
    const v = Number(localStorage.getItem(KEY));
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
}

export function markActive(at = Date.now()) {
  try {
    localStorage.setItem(KEY, String(at));
  } catch {
    // 저장 못 해도 앱은 그대로 동작
  }
}
