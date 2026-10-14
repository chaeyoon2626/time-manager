import { useEffect, useMemo, useState } from 'react';
import { todayKey } from './lib/date';
import type { Area, Habit, Project, RowOf, Session, TableName } from './lib/types';
import { useStore } from './store';

export function useAlive<T extends TableName>(table: T): RowOf<T>[] {
  const rec = useStore((s) => s.data[table]);
  return useMemo(() => (Object.values(rec) as RowOf<T>[]).filter((r) => !r.deleted), [rec]);
}

export function useAreas(): Area[] {
  const list = useAlive('areas');
  return useMemo(() => [...list].sort((a, b) => a.sort - b.sort), [list]);
}

/** 지운 범주도 들어 있다 — 예전 기록의 색·이름을 보여주려고 */
export const useAreaMap = () => useStore((s) => s.data.areas);
export const useProjectMap = () => useStore((s) => s.data.projects);

/** 진행 중인(완료 안 한) 프로젝트·꾸준히, 범주 순 → 만든 순 */
export function useActiveProjects(): Project[] {
  const list = useAlive('projects');
  const areas = useStore((s) => s.data.areas);
  return useMemo(
    () =>
      list
        .filter((p) => !p.done)
        .sort((a, b) => (areas[a.area_id]?.sort ?? 99) - (areas[b.area_id]?.sort ?? 99) || a.sort - b.sort),
    [list, areas],
  );
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

export const useSessions = (): Session[] => useAlive('sessions');

export function useRunning(): Session | undefined {
  const list = useSessions();
  return useMemo(() => list.find((s) => !s.end), [list]);
}

/** ms마다 갱신되는 현재 시각 (자정이 지나면 '오늘'도 바뀐다) */
export function useNow(ms = 60_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

export const useToday = () => {
  useNow();
  return todayKey();
};
