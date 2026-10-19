import type { Area } from './types';

// id는 예전 버전과 호환되게 유지한다 (intellect = 공부, body = 운동)
export const DEFAULT_AREAS: Omit<Area, 'updated_at' | 'deleted'>[] = [
  { id: 'career', name: '커리어', color: '#6366f1', required: true, is_waste: false, sort: 0 },
  { id: 'hobby', name: '취미', color: '#f59e0b', required: true, is_waste: false, sort: 1 },
  { id: 'intellect', name: '공부', color: '#0ea5e9', required: true, is_waste: false, sort: 2 },
  { id: 'body', name: '운동', color: '#10b981', required: true, is_waste: false, sort: 3 },
  // 프로젝트 없는 할 일(약속, 기사님 방문 …)이 기본으로 들어가는 범주
  { id: 'daily', name: '일상', color: '#64748b', required: false, is_waste: false, sort: 4 },
];

export const DAILY_AREA = 'daily';

/** 권장 개수 — 넘어도 추가는 된다 (한눈에 보기 좋은 정도) */
export const RECOMMENDED_AREAS = 9;

/** 새 범주에 차례로 권하는 색 (기본 4개와 겹치지 않게) */
export const AREA_PALETTE = ['#ec4899', '#8b5cf6', '#14b8a6', '#f97316', '#84cc16', '#ef4444', '#64748b', '#a1a1aa', '#0f766e'];
