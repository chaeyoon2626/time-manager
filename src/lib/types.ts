export type Base = { id: string; updated_at: string; deleted: boolean };

export type Area = Base & { name: string; color: string; required: boolean; is_waste: boolean; sort: number };
export type Habit = Base & {
  area_id: string;
  title: string;
  weekdays: number[]; // 0=월 … 6=일, 비어 있으면 매일
  sort: number;
  archived: boolean;
  created_on: string;
};
export type HabitLog = Base & { habit_id: string; date: string };
export type Quadrant = 'q1' | 'q2' | 'q3' | 'q4';
export type Task = Base & { date: string; quadrant: Quadrant; title: string; done: boolean; sort: number };
export type BlockKind = 'plan' | 'actual';
export type TimeBlock = Base & { date: string; kind: BlockKind; slot: number; area_id: string };
export type ReviewLevel = 'day' | 'week';
export type Review = Base & {
  level: ReviewLevel;
  period_key: string;
  line: string;
  good: string;
  bad: string;
  why: string;
  next_action: string;
};

export type BucketItem = Base & {
  title: string;
  area_id: string; // '' = 영역 없음
  minutes: number; // 대략 걸리는 시간, 0 = 모름
  done: boolean;
  done_on: string; // '' = 아직
  sort: number;
};

export type Tables = {
  areas: Record<string, Area>;
  habits: Record<string, Habit>;
  habit_logs: Record<string, HabitLog>;
  tasks: Record<string, Task>;
  time_blocks: Record<string, TimeBlock>;
  reviews: Record<string, Review>;
  bucket_items: Record<string, BucketItem>;
};
export type TableName = keyof Tables;
export type RowOf<T extends TableName> = Tables[T][string];
export type NewRow<T extends TableName> = Omit<RowOf<T>, 'updated_at' | 'deleted'> & { deleted?: boolean };

export const TABLES: TableName[] = ['areas', 'habits', 'habit_logs', 'tasks', 'time_blocks', 'reviews', 'bucket_items'];
