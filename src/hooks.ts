import { useEffect, useMemo, useState } from 'react';
import { todayKey } from './lib/date';
import type { Area, Habit, RowOf, TableName } from './lib/types';
import { useStore } from './store';

export function useAlive<T extends TableName>(table: T): RowOf<T>[] {
  const rec = useStore((s) => s.data[table]);
  return useMemo(() => (Object.values(rec) as RowOf<T>[]).filter((r) => !r.deleted), [rec]);
}

export function useAreas(): Area[] {
  const list = useAlive('areas');
  return useMemo(() => [...list].sort((a, b) => a.sort - b.sort), [list]);
}

export function useAreaMap() {
  return useStore((s) => s.data.areas);
}

export function useHabits(includeArchived = false): Habit[] {
  const list = useAlive('habits');
  return useMemo(
    () => list.filter((h) => includeArchived || !h.archived).sort((a, b) => a.sort - b.sort),
    [list, includeArchived],
  );
}

/** 완료된 habit_log id 집합 */
export function useLogSet() {
  const rec = useStore((s) => s.data.habit_logs);
  return useMemo(() => new Set(Object.values(rec).filter((r) => !r.deleted).map((r) => r.id)), [rec]);
}

/** 1분마다 갱신되는 현재 시각 (자정이 지나면 '오늘'도 바뀐다) */
export function useNow() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

export const useToday = () => {
  useNow();
  return todayKey();
};
