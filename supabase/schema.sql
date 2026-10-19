-- 시간관리 앱 스키마
-- Supabase 대시보드 > SQL Editor 에 통째로 붙여넣고 Run 하세요.
-- 여러 번 실행해도 안전하다 (이미 있는 테이블은 건너뛰고, 예전 버전 테이블은 새 모양으로 고친다. 데이터는 지우지 않음)
--
-- 동기화 규칙
--   * 모든 행은 (user_id, id)로 구분하고, id는 앱이 만든다.
--   * updated_at : 앱에서 마지막으로 수정한 시각 (충돌 시 최신값 우선)
--   * synced_at  : 서버에 저장된 시각 (트리거가 자동 기록, 앱은 이 값 이후 변경분만 받아감)
--   * deleted    : 실제 삭제 대신 표시만 한다 (다른 기기에도 삭제가 전파되도록)

create or replace function public.touch_synced_at()
returns trigger language plpgsql as $$
begin
  new.synced_at := clock_timestamp();
  return new;
end $$;

-- 범주
create table if not exists public.areas (
  user_id    uuid not null default auth.uid() references auth.users on delete cascade,
  id         text not null,
  name       text not null,
  color      text not null,
  required   boolean not null default true,
  is_waste   boolean not null default false,
  sort       int not null default 0,
  updated_at timestamptz not null,
  deleted    boolean not null default false,
  synced_at  timestamptz not null default clock_timestamp(),
  primary key (user_id, id)
);

create table if not exists public.habits (
  user_id    uuid not null default auth.uid() references auth.users on delete cascade,
  id         text not null,
  area_id    text not null,
  title      text not null,
  weekdays   int[] not null default '{}',   -- 0=월 … 6=일, 비어 있으면 매일
  sort       double precision not null default 0,
  archived   boolean not null default false,
  created_on date not null default current_date,
  updated_at timestamptz not null,
  deleted    boolean not null default false,
  synced_at  timestamptz not null default clock_timestamp(),
  primary key (user_id, id)
);

create table if not exists public.habit_logs (
  user_id    uuid not null default auth.uid() references auth.users on delete cascade,
  id         text not null,                 -- {habit_id}_{date}
  habit_id   text not null,
  date       date not null,
  updated_at timestamptz not null,
  deleted    boolean not null default false,
  synced_at  timestamptz not null default clock_timestamp(),
  primary key (user_id, id)
);

-- 프로젝트(할 일 + 마감) · 꾸준히(주간 목표 시간)
create table if not exists public.projects (
  user_id    uuid not null default auth.uid() references auth.users on delete cascade,
  id         text not null,
  area_id    text not null default '',
  title      text not null,
  kind       text not null default 'project' check (kind in ('project', 'steady')),
  due        text not null default '',      -- 'YYYY-MM-DD' 또는 ''
  done       boolean not null default false,
  done_on    text not null default '',
  sort       double precision not null default 0,
  targets    jsonb not null default '[]',   -- 꾸준히: [{"from": "YYYY-MM-DD", "hours": 4}, …]
  note       text not null default '',      -- 자유 메모
  current    text not null default '',      -- 지금 내 상태 (예: HSK 3급 수준)
  current_on text not null default '',
  milestones jsonb not null default '[]',   -- 성과 목표: [{"id","title","start","due","done","done_on","final"}, …]
  updated_at timestamptz not null,
  deleted    boolean not null default false,
  synced_at  timestamptz not null default clock_timestamp(),
  primary key (user_id, id)
);
alter table public.projects add column if not exists note       text  not null default '';
alter table public.projects add column if not exists current    text  not null default '';
alter table public.projects add column if not exists current_on text  not null default '';
alter table public.projects add column if not exists milestones jsonb not null default '[]';

create table if not exists public.tasks (
  user_id    uuid not null default auth.uid() references auth.users on delete cascade,
  id         text not null,
  title      text not null,
  project_id text not null default '',      -- '' = 일회성
  date       text not null default '',      -- 하기로 한 날, '' = 미정
  due        text not null default '',      -- 마감, '' = 없음
  time       text not null default '',      -- 'HH:MM' 약속 시각
  estimate   int not null default 0,        -- 예상 시간(분)
  important  boolean not null default false,
  done       boolean not null default false,
  done_on    text not null default '',
  sort       double precision not null default 0,
  updated_at timestamptz not null,
  deleted    boolean not null default false,
  synced_at  timestamptz not null default clock_timestamp(),
  primary key (user_id, id)
);

-- 예전 버전(4칸 보드)에서 만든 tasks 테이블을 새 모양으로
alter table public.tasks alter column date type text using date::text;
alter table public.tasks alter column date set default '';
alter table public.tasks add column if not exists project_id text not null default '';
alter table public.tasks add column if not exists area_id    text not null default 'daily'; -- 프로젝트 없는 할 일의 범주
alter table public.tasks add column if not exists due        text not null default '';
alter table public.tasks add column if not exists time       text not null default '';
alter table public.tasks add column if not exists estimate   int  not null default 0;
alter table public.tasks add column if not exists important  boolean not null default false;
alter table public.tasks add column if not exists done_on    text not null default '';
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'tasks' and column_name = 'quadrant') then
    alter table public.tasks alter column quadrant drop not null;
    alter table public.tasks alter column quadrant set default 'q2';
  end if;
end $$;

-- 타이머 기록: 켠 시각 ~ 끈 시각 (ISO 문자열, end = '' 이면 재는 중)
create table if not exists public.sessions (
  user_id    uuid not null default auth.uid() references auth.users on delete cascade,
  id         text not null,
  task_id    text not null default '',
  project_id text not null default '',
  area_id    text not null default '',
  habit_id   text not null default '',
  title      text not null default '',
  "start"    text not null,
  "end"      text not null default '',
  updated_at timestamptz not null,
  deleted    boolean not null default false,
  synced_at  timestamptz not null default clock_timestamp(),
  primary key (user_id, id)
);

-- 시간표 계획 칸 (30분 단위, id = {date}_{slot})
create table if not exists public.plan_slots (
  user_id    uuid not null default auth.uid() references auth.users on delete cascade,
  id         text not null,
  date       text not null,
  slot       smallint not null check (slot between 0 and 47),
  task_id    text not null default '',
  habit_id   text not null default '',
  project_id text not null default '',
  title      text not null default '',
  updated_at timestamptz not null,
  deleted    boolean not null default false,
  synced_at  timestamptz not null default clock_timestamp(),
  primary key (user_id, id)
);

-- 반복 할 일(예전 이름: 습관)의 시각·예상 시간
alter table public.habits add column if not exists time     text not null default '';
alter table public.habits add column if not exists estimate int  not null default 0;

-- 예전 버전의 칠하는 타임바 (지금은 읽기만, 기록은 sessions로 옮겨짐)
create table if not exists public.time_blocks (
  user_id    uuid not null default auth.uid() references auth.users on delete cascade,
  id         text not null,
  date       date not null,
  kind       text not null check (kind in ('plan', 'actual')),
  slot       smallint not null check (slot between 0 and 47),
  area_id    text not null,
  updated_at timestamptz not null,
  deleted    boolean not null default false,
  synced_at  timestamptz not null default clock_timestamp(),
  primary key (user_id, id)
);

create table if not exists public.reviews (
  user_id     uuid not null default auth.uid() references auth.users on delete cascade,
  id          text not null,                -- {level}_{period_key}
  level       text not null check (level in ('day', 'week')),
  period_key  text not null,
  line        text not null default '',
  good        text not null default '',
  bad         text not null default '',
  why         text not null default '',
  next_action text not null default '',
  updated_at  timestamptz not null,
  deleted     boolean not null default false,
  synced_at   timestamptz not null default clock_timestamp(),
  primary key (user_id, id)
);

create table if not exists public.bucket_items (
  user_id    uuid not null default auth.uid() references auth.users on delete cascade,
  id         text not null,
  title      text not null,
  area_id    text not null default '',
  minutes    int not null default 0,
  done       boolean not null default false,
  done_on    text not null default '',
  sort       double precision not null default 0,
  updated_at timestamptz not null,
  deleted    boolean not null default false,
  synced_at  timestamptz not null default clock_timestamp(),
  primary key (user_id, id)
);
-- bucket = 시간 날 때 해볼 것, idea = 하고 싶은 것
alter table public.bucket_items add column if not exists kind text not null default 'bucket';
alter table public.bucket_items add column if not exists note text not null default '';

-- 공통: 본인 행만 읽고 쓰기(RLS) + synced_at 트리거 + 인덱스
do $$
declare t text;
begin
  foreach t in array array['areas', 'habits', 'habit_logs', 'projects', 'tasks', 'sessions',
                           'plan_slots', 'time_blocks', 'reviews', 'bucket_items'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "own rows" on public.%I', t);
    execute format(
      'create policy "own rows" on public.%I for all to authenticated
         using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('drop trigger if exists touch_synced_at on public.%I', t);
    execute format(
      'create trigger touch_synced_at before insert or update on public.%I
         for each row execute function public.touch_synced_at()', t);
    execute format('create index if not exists %I on public.%I (user_id, synced_at)', t || '_user_synced_idx', t);
  end loop;
end $$;
