export type Base = { id: string; updated_at: string; deleted: boolean };

/** 범주 (커리어·취미·공부·운동·일상 + 직접 추가) */
export type Area = Base & {
  name: string;
  color: string;
  required: boolean;
  is_waste: boolean;
  sort: number;
  /** 범주 전체에 거는 주간 목표 시간 (꾸준히와 같은 방식, 예: 운동 주 4h). 없으면 목표 없음 */
  targets?: { from: string; hours: number }[];
};

/** 반복 할 일 (예전 이름: 습관) — 매일 또는 정한 요일마다 오늘 목록에 자동으로 뜬다 */
export type Habit = Base & {
  area_id: string;
  title: string;
  weekdays: number[]; // 0=월 … 6=일, 비어 있으면 매일
  sort: number;
  archived: boolean;
  created_on: string;
  time?: string; // 'HH:MM' (예: 학원 19:00), '' = 없음
  estimate?: number; // 예상 시간(분)
  project_id?: string; // 프로젝트·꾸준히 안의 반복 할 일 (예: 중국어 → 단어 50개 매일), '' = 범주만
};
export type HabitLog = Base & { habit_id: string; date: string };

/**
 * project = 할 일이 들어가는 프로젝트 (MST, 취업준비 …), 마감은 있어도 없어도 된다
 * steady  = 꾸준히: 할 일 없이 주간 목표 시간만 (운동, 영어 …). 목표를 올려 가며 기록이 남는다
 */
export type ProjectKind = 'project' | 'steady';
export type Target = { from: string; hours: number }; // from = 그 목표가 시작된 주의 월요일

/** 성과 목표 (예: HSK 4급 취득, 기한 12/14). 순서대로 하나씩 달성해 간다 */
export type Milestone = {
  id: string;
  title: string;
  start: string; // 이 목표를 시작한 날 — 투입 시간을 이날부터 센다
  due: string; // 기한, '' = 없음
  done: boolean;
  done_on: string;
  final: boolean; // 최종 목표
};

export type Project = Base & {
  area_id: string;
  title: string;
  kind: ProjectKind;
  due: string; // '' = 마감 없음
  done: boolean;
  done_on: string;
  sort: number;
  targets: Target[]; // steady만 사용, from 오름차순
  note?: string; // 자유 메모 (왜 하는지, 방향, 참고 자료 …)
  current?: string; // 지금 내 상태 (예: HSK 3급 수준, 단어 600개)
  current_on?: string; // 현재 상태를 마지막으로 고친 날
  milestones?: Milestone[]; // 예전 행에는 없을 수 있다
};

/**
 * 세부 영역: 프로젝트·꾸준히 안의 갈래 (예: 중국어 → 단어 / 듣기 / 독해, 취업준비 → 자소서 / 면접).
 *  - cadence 'days' = 정한 요일마다(weekdays, [] = 매일), 'none' = 가끔(필요할 때만)
 *  - mode 'fixed'  = 매번 같은 내용(fixed_title) → 그날 할 일이 자동으로 생긴다
 *         'choose' = 그날 정하기 → 오늘 목록에 "오늘 뭐 할까?" 빈칸 + 예전에 한 것 칩
 */
export type Subarea = Base & {
  project_id: string;
  name: string;
  cadence: 'none' | 'days';
  weekdays: number[];
  mode: 'fixed' | 'choose';
  fixed_title: string;
  estimate: number;
  time: string;
  sort: number;
  archived: boolean;
  created_on: string;
  skips: string[]; // "오늘은 쉬기" 한 날짜들
};

export type Task = Base & {
  subarea_id?: string; // 세부 영역에 속한 할 일
  /** 세부 영역에서 그날을 위해 생긴 할 일 — 그날에만 보이고, 지나도 밀림으로 쌓이지 않는다 */
  routine?: boolean;
  title: string;
  project_id: string; // '' = 프로젝트 없음 → area_id 범주(기본 일상)로 분류
  area_id?: string; // 프로젝트 없는 할 일의 범주, 없으면 'daily'
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

/** 시간표의 계획 칸 하나(30분). id = {date}_{slot} — 한 칸엔 한 가지 일만 */
export type PlanSlot = Base & {
  date: string;
  slot: number; // 0 = 00:00, 1 = 00:30 …
  task_id: string;
  habit_id: string;
  project_id: string; // 할 일의 프로젝트, 또는 꾸준히 자체
  title: string;
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

/**
 * bucket = 시간 날 때 해볼 것 (걸리는 시간으로 거르기)
 * idea   = 하고 싶은 것 (서평 블로그 운영 …) — 아직 목표로 삼긴 이른 것, 나중에 프로젝트·꾸준히로 올린다
 */
export type BucketKind = 'bucket' | 'idea';
export type BucketItem = Base & {
  kind?: BucketKind; // 없으면 bucket
  note?: string;
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
  subareas: Record<string, Subarea>;
  tasks: Record<string, Task>;
  sessions: Record<string, Session>;
  plan_slots: Record<string, PlanSlot>;
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
  'subareas',
  'tasks',
  'sessions',
  'plan_slots',
  'reviews',
  'bucket_items',
  'time_blocks',
];
