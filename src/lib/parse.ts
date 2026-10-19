import { addDays, toKey, weekdayIdx, weekStart } from './date';
import type { Area, Project } from './types';

/** "매일", "평일", "주말", "월수금", "화목", "매주화", "화요일마다" → 반복 요일 */
function repeatWord(w: string): number[] | undefined {
  if (w === '매일') return [];
  if (w === '평일') return [0, 1, 2, 3, 4];
  if (w === '주말') return [5, 6];
  const m = w.match(/^(?:매주)?([월화수목금토일]+)(?:요일)?(?:마다)?$/);
  // 한 글자("월")만 있으면 반복으로 보지 않는다 — "매주월", "월요일마다"처럼 써야 한다
  if (!m || (m[1].length < 2 && !/^매주|마다$/.test(w))) return undefined;
  const days = [...new Set([...m[1]].map((c) => DAY_WORDS.indexOf(c)))].sort((a, b) => a - b);
  return days.length === 7 ? [] : days;
}

export type Parsed = {
  title: string;
  project_id?: string;
  area_id?: string; // #범주 (프로젝트 이름과 안 맞을 때)
  repeat?: number[]; // 반복 요일 (0=월 … 6=일), [] = 매일
  date?: string;
  due?: string;
  time?: string;
  estimate?: number;
  important?: boolean;
};

const DAY_WORDS = ['월', '화', '수', '목', '금', '토', '일'];
const pad = (n: number) => String(n).padStart(2, '0');

/** "10/19", "10.19" → 올해(지났으면 내년) 날짜 */
function monthDay(m: number, d: number, today: string) {
  if (m < 1 || m > 12 || d < 1 || d > 31) return undefined;
  const y = Number(today.slice(0, 4));
  const k = `${y}-${pad(m)}-${pad(d)}`;
  return k < addDays(today, -60) ? `${y + 1}-${pad(m)}-${pad(d)}` : k;
}

/**
 * 오전/오후가 붙으면 그대로, "N시"(1~6시)만 쓰면 오후로 본다 — "3시 기사님"은 보통 15시니까.
 * "14:00"처럼 콜론으로 쓴 건 적힌 그대로.
 */
function clockOf(ampm: string | undefined, h: number, min: number, guessPm: boolean) {
  if (ampm === '오후' && h < 12) h += 12;
  else if (ampm === '오전' && h === 12) h = 0;
  else if (!ampm && guessPm && h >= 1 && h <= 6) h += 12;
  return `${pad(h)}:${pad(min)}`;
}

function dayWord(w: string, today: string): string | undefined {
  if (w === '오늘') return today;
  if (w === '내일') return addDays(today, 1);
  if (w === '모레') return addDays(today, 2);
  const m = w.match(/^(다음주)?([월화수목금토일])요일$/);
  if (m) {
    const target = DAY_WORDS.indexOf(m[2]);
    // "금요일" = 오늘 포함 가장 가까운 금요일, "다음주 금요일" = 다음 주(월~일)의 금요일
    if (m[1]) return addDays(weekStart(today), 7 + target);
    return addDays(today, (target - weekdayIdx(today) + 7) % 7);
  }
  const md = w.match(/^(\d{1,2})[/.](\d{1,2})$/);
  if (md) return monthDay(Number(md[1]), Number(md[2]), today);
  return undefined;
}

/**
 * 한 줄 입력을 할 일로 풀어낸다. 알아본 부분만 빼고 나머지는 제목.
 *   #MST        → 프로젝트 (이름 앞부분만 맞아도 됨, 띄어쓰기 무시)
 *   오늘 내일 모레 금요일 다음주월요일 10/19  → 하기로 한 날
 *   ~10/19  마감10/19  10/19마감              → 마감일
 *   14:00  9시  3시 30분  오후 3시  오전 7시   → 약속 시각 (그냥 1~6시는 오후로)
 *   1h  1.5h  30m  2시간  40분                 → 예상 시간
 *   !                                          → 중요
 *   매일  평일  주말  월수금  화목  매주화  화요일마다 → 반복 할 일로 만든다
 *   #범주 (프로젝트 이름과 안 맞으면)              → 그 범주 (기본은 일상)
 */
export function parseTask(text: string, projects: Project[], today = toKey(new Date()), areas: Area[] = []): Parsed {
  const out: Parsed = { title: '' };
  const words: string[] = [];
  const tokens = text
    .replace(/다음주\s+([월화수목금토일]요일)/g, '다음주$1')
    .replace(/(\d{1,2})시\s+(\d{1,2})분/g, '$1시$2분') // "3시 30분" → 한 덩어리
    .replace(/(오전|오후)\s+(?=\d)/g, '$1') // "오후 3시" → "오후3시"
    .trim()
    .split(/\s+/);

  for (const tok of tokens) {
    let m: RegExpMatchArray | null;
    if (tok === '!' || tok === '!중요') {
      out.important = true;
    } else if (tok.startsWith('#') && tok.length > 1) {
      // 프로젝트·꾸준히 이름 정확히 → 범주 이름 정확히 → 프로젝트 앞부분 → 범주 앞부분
      const q = tok.slice(1).replace(/\s/g, '').toLowerCase();
      const norm = (s: string) => s.replace(/\s/g, '').toLowerCase();
      const pExact = projects.find((p) => norm(p.title) === q);
      const aExact = areas.find((a) => norm(a.name) === q);
      const pPrefix = projects.find((p) => norm(p.title).startsWith(q) || norm(p.title).includes(q));
      const aPrefix = areas.find((a) => norm(a.name).startsWith(q));
      if (pExact) out.project_id = pExact.id;
      else if (aExact) out.area_id = aExact.id;
      else if (pPrefix) out.project_id = pPrefix.id;
      else if (aPrefix) out.area_id = aPrefix.id;
      else words.push(tok);
    } else if (repeatWord(tok) && out.repeat === undefined) {
      out.repeat = repeatWord(tok);
    } else if ((m = tok.match(/^(?:~|마감)(\d{1,2})[/.](\d{1,2})$/) ?? tok.match(/^(\d{1,2})[/.](\d{1,2})마감$/))) {
      out.due = monthDay(Number(m[1]), Number(m[2]), today) ?? out.due;
    } else if ((m = tok.match(/^(오전|오후)?(\d{1,2}):(\d{2})$/)) && Number(m[2]) < 24 && Number(m[3]) < 60) {
      out.time = clockOf(m[1], Number(m[2]), Number(m[3]), false);
    } else if ((m = tok.match(/^(\d+(?:\.\d+)?)(h|시간)$/))) {
      out.estimate = Math.round(Number(m[1]) * 60);
    } else if ((m = tok.match(/^(\d+)(m|분)$/))) {
      out.estimate = Number(m[1]);
    } else if ((m = tok.match(/^(오전|오후)?(\d{1,2})시(?:(\d{1,2})분)?$/)) && Number(m[2]) < 24 && Number(m[3] ?? 0) < 60) {
      out.time = clockOf(m[1], Number(m[2]), Number(m[3] ?? 0), true);
    } else if (dayWord(tok, today) && out.date === undefined) {
      out.date = dayWord(tok, today);
    } else {
      words.push(tok);
    }
  }
  out.title = words.join(' ');
  return out;
}
