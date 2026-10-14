import type { Area } from './types';

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
