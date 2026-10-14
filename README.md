# 시간관리

《포커스》 타임트래커 방식(습관 · 포커스 보드 · 계획/실제 타임바 · 회고)을 웹앱으로 만든 것.
폰 · 노트북 · 데스크탑에서 같은 주소로 쓰고, 홈 화면에 앱처럼 설치할 수 있다.

## 지금 들어 있는 것 (1단계)

| 화면 | 기능 |
|---|---|
| **오늘** | 습관 체크(연속 기록) · 4분면 포커스 보드(밀린 할 일 가져오기, 내일로 미루기, 드래그 이동) · 계획/실제 타임바(30분 단위) · 한 줄 회고 |
| **이번 주** | 습관 체크표 · 영역 밸런스(계획 vs 실제) · 요일별 시간 · 주간 회고(잘한 점/아쉬운 점/왜/다음 주) |
| **버킷리스트** (상단 버튼) | 시간 날 때 할 것 적어두기 · 걸리는 시간으로 거르기(“1시간 있어”) · 하나 골라줘 · 오늘 할 일로 보내기 |
| **설정** | 계정·동기화 · 영역 이름/색/필수 여부 · 습관 요일 설정/보관 · 타임바 시간 범위 · JSON 백업 |

영역: 커리어 · 지적 · 신체 · 취미(필수) / 사회(선택) / 낭비(시간 기록 전용)

**빠른 이유:** 모든 기록은 먼저 기기 안(IndexedDB)에 저장되고 화면은 즉시 바뀐다.
서버 동기화는 뒤에서 1초 뒤에 몰아서 한다. 인터넷이 끊겨도 그대로 쓸 수 있다.

## 1. 내 컴퓨터에서 실행

```bash
npm install
npm run dev
```

http://localhost:5173 을 연다. Supabase 설정 전에는 **이 기기에만 저장**되는 모드로 동작한다.

## 2. 기기 간 동기화 켜기 (Supabase, 무료)

1. https://supabase.com 에 로그인 → **New project** (지역은 `Northeast Asia (Seoul)` 추천)
2. 왼쪽 **SQL Editor** → `supabase/schema.sql` 내용을 통째로 붙여넣고 **Run**
3. 상단 **Connect** → **Framework** 탭 → 아래 **`.env.local`** 탭의 두 줄을 복사 (오른쪽 복사 아이콘)
   - 1번 `npm install …`, 다른 파일 탭들, Agent Skills는 Next.js용이라 **무시**
4. 이 폴더(`focus-planner`)에 `.env.local` 파일을 만들고 복사한 두 줄을 그대로 붙여넣기:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxxx
   ```
   (`VITE_SUPABASE_URL` / `VITE_SUPABASE_KEY` 이름으로 써도 된다)
5. `npm run dev`를 다시 켜고 → 설정 탭에서 **가입하기**
   - 가입하면 확인 메일이 온다. 메일 확인이 귀찮으면 Supabase의
     Authentication → Sign In / Providers → Email → **Confirm email**을 끄면 된다.

> 다른 사람은 내 데이터를 볼 수 없다. 모든 테이블에 "본인 행만" 규칙(RLS)이 걸려 있다.
> 무료 프로젝트는 **1주일 동안 아무 접속이 없으면 일시정지**된다. 매일 쓰면 상관없고, 멈췄으면 대시보드에서 Restore 누르면 된다.

## 3. 인터넷 주소로 올리기 (Netlify, 무료)

1. 이 폴더를 GitHub 저장소로 올린다 (`.env.local`은 자동으로 제외됨)
2. https://app.netlify.com → **Add new site → Import from Git** → 저장소 선택 (빌드 설정은 `netlify.toml`에 있음)
3. Site configuration → **Environment variables**에 `.env.local`의 두 값을 같은 이름으로 넣고 다시 배포
4. Supabase → Authentication → URL Configuration → **Site URL**을 Netlify 주소로 바꾼다 (가입 확인 메일 링크용)

## 4. 폰에 설치

- **아이폰:** Safari로 주소 열기 → 공유 버튼 → **홈 화면에 추가**
- **안드로이드:** Chrome으로 열기 → 메뉴 → **앱 설치** (또는 홈 화면에 추가)

타임바는 폰에서 **탭하면 한 칸**, **꾹 누른 채 끌면 여러 칸** 칠해진다. 그냥 쓸어내리면 스크롤.

## 구조

```
src/
  store.ts        기기 저장소(zustand + IndexedDB) · 모든 쓰기는 putRows()로
  sync.ts         Supabase 동기화: 바뀐 행 올리기(push) → 서버 변경분 받기(pull), 최신 수정이 이김
  actions.ts      기능 함수: toggleHabit, addTask, pullOverdue, setBlocks, copyPlanToActual, saveReview …
  lib/stats.ts    streak, dayBlocks(영역별 시간·계획 실행률) 계산
  pages/          Today · Week · Settings
  components/     HabitToday · FocusBoard · TimeBar · DateNav …
supabase/schema.sql
```

## 다음 단계 (계획)

- 2단계: 월간 · 분기 · 연간 목표와 KPI, 목표 ↔ 습관/할 일/시간 연결, 회고에 통계 자동 첨부
- 3단계: 통계 탭(히트맵, 주별 추이), 알림, CSV 내보내기
