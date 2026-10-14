import type { Area, Quadrant } from './types';

export const DEFAULT_AREAS: Omit<Area, 'updated_at' | 'deleted'>[] = [
  { id: 'career', name: '커리어', color: '#6366f1', required: true, is_waste: false, sort: 0 },
  { id: 'intellect', name: '지적', color: '#0ea5e9', required: true, is_waste: false, sort: 1 },
  { id: 'body', name: '신체', color: '#10b981', required: true, is_waste: false, sort: 2 },
  { id: 'hobby', name: '취미', color: '#f59e0b', required: true, is_waste: false, sort: 3 },
  { id: 'social', name: '사회', color: '#ec4899', required: false, is_waste: false, sort: 4 },
  { id: 'waste', name: '낭비', color: '#a1a1aa', required: false, is_waste: true, sort: 5 },
];

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
