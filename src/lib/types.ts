export type Base = { id: string; updated_at: string; deleted: boolean };

/** 범주 (커리어·취미·공부·운동 + 직접 추가, 최대 9개) */
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

/**
 * project = 할 일이 들어가는 프로젝트 (MST, 취업준비 …), 마감은 있어도 없어도 된다
 * steady  = 꾸준히: 할 일 없이 주간 목표 시간만 (운동, 영어 …). 목표를 올려 가며 기록이 남는다
 */
export type ProjectKind = 'project' | 'steady';
export type Target = { from: string; hours: number }; // from = 그 목표가 시작된 주의 월요일
export type Project = Base & {
  area_id: string;
  title: string;
  kind: ProjectKind;
  due: string; // '' = 마감 없음
  done: boolean;
  done_on: string;
  sort: number;
  targets: Target[]; // steady만 사용, from 오름차순
};

export type Task = Base & {
  title: string;
  project_id: string; // '' = 일회성
  date: string; // 하기로 한 날, '' = 미정
  due: string; // 마감일, '' = 없음
  time: string; // 'HH:MM' 약속 시각, '' = 없음
  estimate: number; // 예상 시간(분), 0 = 모름
  important: boolean;
  done: boolean;
  done_on: string;
  sort: number;
};

/** 타이머 기록: 켠 시각 ~ 끈 시각. end가 ''이면 지금 재는 중 */
export type Session = Base & {
  task_id: string;
  project_id: string;
  area_id: string;
  habit_id: string;
  title: string; // 기록 당시 이름 (할 일이 지워져도 남게)
  start: string; // ISO
  end: string; // ISO, '' = 진행 중
};

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
  area_id: string; // '' = 범주 없음
  minutes: number; // 대략 걸리는 시간, 0 = 모름
  done: boolean;
  done_on: string; // '' = 아직
  sort: number;
};

/** 예전 버전의 칠하는 타임바 기록 — 이제는 세션으로 옮겨 쓰고 읽기만 한다 */
export type TimeBlock = Base & { date: string; kind: 'plan' | 'actual'; slot: number; area_id: string };

export type Tables = {
  areas: Record<string, Area>;
  habits: Record<string, Habit>;
  habit_logs: Record<string, HabitLog>;
  projects: Record<string, Project>;
  tasks: Record<string, Task>;
  sessions: Record<string, Session>;
  reviews: Record<string, Review>;
  bucket_items: Record<string, BucketItem>;
  time_blocks: Record<string, TimeBlock>;
};
export type TableName = keyof Tables;
export type RowOf<T extends TableName> = Tables[T][string];
export type NewRow<T extends TableName> = Omit<RowOf<T>, 'updated_at' | 'deleted'> & { deleted?: boolean };

export const TABLES: TableName[] = [
  'areas',
  'habits',
  'habit_logs',
  'projects',
  'tasks',
  'sessions',
  'reviews',
  'bucket_items',
  'time_blocks',
];
