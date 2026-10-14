-- 시간관리 앱 스키마
-- Supabase 대시보드 > SQL Editor 에 통째로 붙여넣고 Run 하세요.
-- 여러 번 실행해도 안전하다 (이미 있는 테이블·규칙은 건너뛰거나 다시 만든다, 데이터는 지우지 않음)
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

create table if not exists public.tasks (
  user_id    uuid not null default auth.uid() references auth.users on delete cascade,
  id         text not null,
  date       date not null,
  quadrant   text not null check (quadrant in ('q1', 'q2', 'q3', 'q4')),
  title      text not null,
  done       boolean not null default false,
  sort       double precision not null default 0,
  updated_at timestamptz not null,
  deleted    boolean not null default false,
  synced_at  timestamptz not null default clock_timestamp(),
  primary key (user_id, id)
);

create table if not exists public.time_blocks (
  user_id    uuid not null default auth.uid() references auth.users on delete cascade,
  id         text not null,                 -- {date}_{kind}_{slot}
  date       date not null,
  kind       text not null check (kind in ('plan', 'actual')),
  slot       smallint not null check (slot between 0 and 47),  -- 30분 단위, 0 = 00:00
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
  area_id    text not null default '',     -- '' = 영역 없음
  minutes    int not null default 0,       -- 대략 걸리는 시간, 0 = 모름
  done       boolean not null default false,
  done_on    text not null default '',     -- 'YYYY-MM-DD' 또는 ''
  sort       double precision not null default 0,
  updated_at timestamptz not null,
  deleted    boolean not null default false,
  synced_at  timestamptz not null default clock_timestamp(),
  primary key (user_id, id)
);

-- 범주 안의 세부 항목 (예: 공부 → 독서, 영어)
create table if not exists public.activities (
  user_id    uuid not null default auth.uid() references auth.users on delete cascade,
  id         text not null,
  area_id    text not null,
  name       text not null,
  sort       double precision not null default 0,
  archived   boolean not null default false,
  updated_at timestamptz not null,
  deleted    boolean not null default false,
  synced_at  timestamptz not null default clock_timestamp(),
  primary key (user_id, id)
);

-- 타임바 칸에 세부 항목 연결 ('' = 없음)
alter table public.time_blocks add column if not exists activity_id text not null default '';

-- 공통: 본인 행만 읽고 쓰기(RLS) + synced_at 트리거 + 인덱스
do $$
declare t text;
begin
  foreach t in array array['areas', 'activities', 'habits', 'habit_logs', 'tasks', 'time_blocks', 'reviews', 'bucket_items'] loop
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
