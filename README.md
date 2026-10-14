# 시간관리

타임트래커를 여러개 참고하여 시간관리하고 실제 목표를 달성할 수 있게 웹앱으로 만든 것.
폰 · 노트북 · 데스크탑에서 같은 주소로 쓰고, 홈 화면에 앱처럼 설치할 수 있다.

## 구조: 범주 → 프로젝트·꾸준히 → 할 일

```
범주 (커리어 · 취미 · 공부 · 운동 + 직접 추가, 최대 9개)
 ├ 프로젝트 (MST, 취업준비, 논문완성 …)  할 일 + 마감(없어도 됨)
 └ 꾸준히   (운동, 영어, 베이스 …)        주간 목표 시간, 조금씩 올리다가 유지
일회성 할 일 (선풍기 기사님 방문 …)        프로젝트 없이
습관 (Anki 20분 …)                         요일 반복, 연속 기록
```

## 화면

| 화면 | 기능 |
|---|---|
| **오늘** | 한 목록(할 일 · 분류 · 예상 · 마감)<br>① 오늘 할 일·오늘 마감 (밀린 일 빨간색, 약속 시각 → ★중요 순)<br>② 프로젝트 할 일·다가오는 일 — 모든 프로젝트를 한 번에, **마감순**, `+오늘`로 ①로 올리기<br>③ 꾸준히 — 이번 주 기록 / 목표<br>오른쪽: 오늘 기록(하루 막대 · 기록 목록 · 깜빡한 기록 추가) · 한 줄 회고 |
| **프로젝트** | 범주별 목록(D-day · 누적 시간 · 남은 할 일) · 프로젝트 상세(할 일, 남은 예상, 누적 기록) · 꾸준히 상세(이번 주 진행, 목표 변경, 최근 8주, 목표 변화 기록) |
| **이번 주** | 기록 시간 · 범주 밸런스 · 프로젝트/꾸준히별 시간 · 요일별 기록 · 습관 체크표 · 주간 회고 |
| **버킷리스트** (상단 버튼) | 시간 날 때 할 것 · 걸리는 시간으로 거르기 · 하나 골라줘 · 오늘 할 일로 보내기 |
| **설정** | 계정·동기화 · 범주(이름/색/필수/추가/삭제) · 습관 · 하루 막대 범위 · JSON 백업 |

**타이머:** 할 일·습관·꾸준히 옆 ▶ = 시작, ■ = 정지. 켠 시각~끈 시각이 그대로 기록된다 (뽀모도로 없음).
하나만 돈다(다른 걸 켜면 앞의 것이 끝남). 1분 안에 끄면 실수로 보고 지운다. 켜둔 타이머도 기기 간 동기화된다.

**빠른 입력:** `문항 코드 정리 #MST 내일 2h ~10/30 !`
`#프로젝트`(앞부분만 맞아도 됨) · `오늘/내일/모레/금요일/다음주 월요일/10/19`(할 날) · `14:00, 3시 30분, 오후 3시`(약속, 그냥 1~6시는 오후) · `1h, 1.5h, 40분`(예상) · `~10/19, 10/19마감`(마감) · `!`(중요).
아무것도 안 붙이면 오늘 할 일(일회성), `#프로젝트`만 붙이면 날짜 미정 프로젝트 할 일.

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

## 코드 구조

```
src/
  store.ts        기기 저장소(zustand + IndexedDB) · 모든 쓰기는 putRows()로 · 예전 버전 데이터 이전(migrate)
  sync.ts         Supabase 동기화: 바뀐 행 올리기(push) → 서버 변경분 받기(pull), 최신 수정이 이김
  actions.ts      addTaskFromText, toggleTask, addProject, setTarget, startTimer/stopTimer, addSession …
  lib/parse.ts    빠른 입력 한 줄 해석
  lib/stats.ts    streak, sumSessions(기간별 범주·프로젝트 시간), effectiveDue, targetFor
  pages/          Today · Projects · Week · Settings
  components/     TaskList(표·행·빠른 입력) · DayLog · TimerBar · BucketList …
supabase/schema.sql   여러 번 실행해도 안전 (예전 테이블은 새 모양으로 고침)
```

## 다음 단계 (아이디어)

- 4칸 보기: ★중요 × 마감 임박(2일 이내)으로 자동 배치되는 보기 전환
- 반복 할 일, 알림, 통계(1년 히트맵, 프로젝트별 추이), CSV 내보내기
