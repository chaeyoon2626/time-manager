import type { BlockKind, ReviewLevel } from './types';

export const uid = () => crypto.randomUUID();
// 아래 id들은 내용으로 정해진다 → 어느 기기에서 기록해도 같은 칸은 같은 행이 된다
export const logId = (habitId: string, date: string) => `${habitId}_${date}`;
export const blockId = (date: string, kind: BlockKind, slot: number) => `${date}_${kind}_${slot}`;
export const reviewId = (level: ReviewLevel, key: string) => `${level}_${key}`;
