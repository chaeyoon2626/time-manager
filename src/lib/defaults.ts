import type { Area, Quadrant } from './types';

// id는 예전 버전과 호환되게 유지한다 (intellect = 공부, body = 운동)
export const DEFAULT_AREAS: Omit<Area, 'updated_at' | 'deleted'>[] = [
  { id: 'career', name: '커리어', color: '#6366f1', required: true, is_waste: false, sort: 0 },
  { id: 'hobby', name: '취미', color: '#f59e0b', required: true, is_waste: false, sort: 1 },
  { id: 'intellect', name: '공부', color: '#0ea5e9', required: true, is_waste: false, sort: 2 },
  { id: 'body', name: '운동', color: '#10b981', required: true, is_waste: false, sort: 3 },
];

export const MAX_AREAS = 9;

/** 새 범주에 차례로 권하는 색 (기본 4개와 겹치지 않게) */
export const AREA_PALETTE = ['#ec4899', '#8b5cf6', '#14b8a6', '#f97316', '#84cc16', '#ef4444', '#64748b', '#a1a1aa', '#0f766e'];

export const QUADRANTS: {
  id: Quadrant;
  title: string;
  hint: string;
  dot: string;
  box: string;
  ring: string;
}[] = [
  {
    id: 'q1', title: '지금 할 일', hint: '중요 · 긴급', dot: 'bg-rose-500',
    box: 'bg-rose-50/70 border-rose-200/70 dark:bg-rose-500/[0.06] dark:border-rose-500/20', ring: 'ring-rose-400/60',
  },
  {
    id: 'q2', title: '성장 투자', hint: '중요 · 안 급함', dot: 'bg-indigo-500',
    box: 'bg-indigo-50/70 border-indigo-200/70 dark:bg-indigo-500/[0.06] dark:border-indigo-500/20', ring: 'ring-indigo-400/60',
  },
  {
    id: 'q3', title: '빨리 처리', hint: '급함 · 덜 중요', dot: 'bg-amber-500',
    box: 'bg-amber-50/70 border-amber-200/70 dark:bg-amber-500/[0.06] dark:border-amber-500/20', ring: 'ring-amber-400/60',
  },
  {
    id: 'q4', title: '줄일 것', hint: '안 급함 · 안 중요', dot: 'bg-zinc-400',
    box: 'bg-zinc-100/70 border-zinc-200 dark:bg-zinc-800/40 dark:border-zinc-700/60', ring: 'ring-zinc-400/60',
  },
];
