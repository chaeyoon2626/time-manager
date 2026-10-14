const pad = (n: number) => String(n).padStart(2, '0');

export const DAY_LABELS = ['월', '화', '수', '목', '금', '토', '일'];

export const toKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const fromKey = (k: string) => {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y, m - 1, d);
};
export const todayKey = () => toKey(new Date());
export const addDays = (k: string, n: number) => {
  const d = fromKey(k);
  d.setDate(d.getDate() + n);
  return toKey(d);
};
export const diffDays = (a: string, b: string) => Math.round((fromKey(a).getTime() - fromKey(b).getTime()) / 86_400_000);
export const weekdayIdx = (k: string) => (fromKey(k).getDay() + 6) % 7;
export const weekStart = (k: string) => addDays(k, -weekdayIdx(k));
export const weekDays = (k: string) => {
  const s = weekStart(k);
  return Array.from({ length: 7 }, (_, i) => addDays(s, i));
};
export const fmtMD = (k: string) => {
  const d = fromKey(k);
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
};
export const fmtShort = (k: string) => {
  const d = fromKey(k);
  return `${d.getMonth() + 1}/${d.getDate()}`;
};
/** ISO 주차 (그 주 목요일이 속한 해 기준) */
export function isoWeek(k: string) {
  const thu = fromKey(addDays(k, 3 - weekdayIdx(k)));
  const jan1 = new Date(thu.getFullYear(), 0, 1);
  return Math.floor((thu.getTime() - jan1.getTime()) / 86_400_000 / 7) + 1;
}
export const slotLabel = (slot: number) => `${pad(Math.floor(slot / 2))}:${slot % 2 ? '30' : '00'}`;
/** 30분 칸 개수 → "3.5h" */
export const hours = (slots: number) => {
  const h = slots / 2;
  return Number.isInteger(h) ? `${h}h` : `${h.toFixed(1)}h`;
};
