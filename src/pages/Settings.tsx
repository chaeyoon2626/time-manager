import { useRef, useState } from 'react';
import { Archive, ArchiveRestore, Download, Trash2, Upload } from 'lucide-react';
import {
  addArea,
  addHabit,
  deleteArea,
  setAreaTarget,
  exportData,
  importData,
  updateArea,
  updateHabit,
  updateSettings,
} from '../actions';
import { Button, Card, Switch, cn, fieldCls, inputCls } from '../components/ui';
import { useAreas, useHabits } from '../hooks';
import { DAY_LABELS, fmtDur, todayKey, weekStart } from '../lib/date';
import { targetFor } from '../lib/stats';
import { AREA_PALETTE, RECOMMENDED_AREAS } from '../lib/defaults';
import { supabase } from '../lib/supabase';
import type { Habit } from '../lib/types';
import { useStore } from '../store';
import { syncNow } from '../sync';

export function SettingsPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-[22px] font-bold tracking-tight">설정</h1>
      <Account />
      <Areas />
      <Habits />
      <TimeRange />
      <DataBackup />
    </div>
  );
}

function Account() {
  const email = useStore((s) => s.userEmail);
  const status = useStore((s) => s.syncStatus);
  const error = useStore((s) => s.syncError);
  const last = useStore((s) => s.lastSyncedAt);

  if (!supabase)
    return (
      <Card title="계정 · 동기화">
        <p className="text-sm text-zinc-600 dark:text-zinc-300">
          지금은 <b>이 기기에만 저장</b>하는 모드예요. 폰·노트북과 연동하려면 Supabase 주소와 키를{' '}
          <code className="rounded bg-zinc-100 px-1 text-xs dark:bg-zinc-800">.env.local</code>에 넣어 주세요. (README 참고)
        </p>
      </Card>
    );

  if (!email) return <AuthForm />;

  return (
    <Card title="계정 · 동기화">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{email}</div>
          <div className="text-xs text-zinc-400">
            {status === 'syncing'
              ? '동기화 중…'
              : last
                ? `마지막 동기화 ${new Date(last).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}`
                : '아직 동기화 전'}
          </div>
        </div>
        <Button variant="outline" onClick={() => syncNow()}>
          지금 동기화
        </Button>
        <Button onClick={() => supabase!.auth.signOut()}>로그아웃</Button>
      </div>
      {status === 'error' && error && <p className="mt-2 text-xs text-rose-600">{error}</p>}
    </Card>
  );
}

function AuthForm() {
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const res =
      mode === 'in'
        ? await supabase!.auth.signInWithPassword({ email, password: pw })
        : await supabase!.auth.signUp({ email, password: pw });
    setBusy(false);
    if (res.error) setMsg(res.error.message);
    else if (mode === 'up' && !res.data.session) setMsg('확인 메일을 보냈어요. 메일의 링크를 누른 뒤 여기서 로그인하세요.');
  }

  return (
    <Card title="계정 · 동기화">
      <p className="mb-3 text-sm text-zinc-500">로그인하면 폰·노트북·데스크탑의 기록이 자동으로 맞춰져요.</p>
      <form onSubmit={submit} className="space-y-2">
        <input type="email" required autoComplete="email" placeholder="이메일" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
        <input
          type="password"
          required
          minLength={6}
          autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
          placeholder="비밀번호 (6자 이상)"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          className={inputCls}
        />
        <div className="flex items-center gap-2 pt-1">
          <Button type="submit" variant="primary" disabled={busy}>
            {mode === 'in' ? '로그인' : '가입하기'}
          </Button>
          <Button type="button" onClick={() => setMode(mode === 'in' ? 'up' : 'in')}>
            {mode === 'in' ? '처음이에요 (가입)' : '이미 계정이 있어요'}
          </Button>
        </div>
        {msg && <p className="text-xs text-zinc-500">{msg}</p>}
      </form>
    </Card>
  );
}

function Areas() {
  const areas = useAreas();
  const used = new Set(areas.map((a) => a.color));
  const nextColor = AREA_PALETTE.find((c) => !used.has(c)) ?? AREA_PALETTE[0];
  const [name, setName] = useState('');
  const [color, setColor] = useState<string | null>(null);
  const over = areas.length >= RECOMMENDED_AREAS;

  return (
    <Card title={`범주 ${areas.length}개`}>
      <p className="mb-3 text-xs text-zinc-400">
        시간·반복 할 일·프로젝트를 나누는 큰 칸이에요. 프로젝트 없는 할 일은 기본으로 <b>일상</b>에 들어가요.{' '}
        <b>필수</b>를 켜면 그 주에 기록이 없을 때 “기록 없음”으로 알려줘요.
      </p>
      <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
        {areas.map((a) => (
          <li key={a.id} className="py-3">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <label className="relative size-7 shrink-0 cursor-pointer overflow-hidden rounded-full ring-1 ring-black/5" style={{ background: a.color }}>
                <input
                  type="color"
                  value={a.color}
                  onChange={(e) => updateArea(a.id, { color: e.target.value })}
                  className="absolute inset-0 cursor-pointer opacity-0"
                  aria-label={`${a.name} 색`}
                />
              </label>
              <input value={a.name} onChange={(e) => updateArea(a.id, { name: e.target.value })} className={cn(fieldCls, 'h-8 min-w-32 flex-1 px-3 sm:max-w-48 sm:flex-none')} aria-label="범주 이름" />
              <div className="ml-auto flex items-center gap-2 text-xs text-zinc-500">
                <label className="flex items-center gap-1" title="범주 전체 주간 목표 시간 (0 = 없음)">
                  주
                  <input
                    type="number"
                    min={0}
                    step={0.5}
                    value={targetFor(a, weekStart(todayKey())) || ''}
                    placeholder="–"
                    onChange={(e) => setAreaTarget(a, Number(e.target.value) || 0)}
                    className={cn(fieldCls, 'h-8 w-14 px-1.5 text-center text-xs')}
                    aria-label={`${a.name} 주간 목표 시간`}
                  />
                  h
                </label>
                필수
                <Switch label={`${a.name} 필수`} checked={a.required} onChange={(v) => updateArea(a.id, { required: v })} />
                <Button
                  aria-label={`${a.name} 삭제`}
                  title="삭제 (이미 기록한 시간은 남아요)"
                  className="w-8 px-0 text-zinc-400 hover:text-rose-500"
                  onClick={() => confirm(`'${a.name}' 범주를 지울까요? 이미 기록한 시간은 그대로 남아요.`) && deleteArea(a.id)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </div>
          </li>
        ))}
      </ul>
        <form
          className="mt-3 flex items-center gap-2 border-t border-zinc-100 pt-3 dark:border-zinc-800"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            addArea(name, color ?? nextColor);
            setName('');
            setColor(null);
          }}
        >
          <label className="relative size-7 shrink-0 cursor-pointer overflow-hidden rounded-full ring-1 ring-black/5" style={{ background: color ?? nextColor }}>
            <input type="color" value={color ?? nextColor} onChange={(e) => setColor(e.target.value)} className="absolute inset-0 cursor-pointer opacity-0" aria-label="새 범주 색" />
          </label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="새 범주 (예: 사람, 휴식, 낭비)" className={cn(fieldCls, 'h-9 min-w-0 flex-1 px-3')} />
          <Button type="submit" variant="primary" className="h-9 shrink-0">
            추가
          </Button>
        </form>
      {over && (
        <p className="mt-2 text-xs text-amber-600">
          {RECOMMENDED_AREAS}개가 넘었어요. 더 만들어도 되지만, 너무 많으면 한눈에 보기 어려워요.
        </p>
      )}
    </Card>
  );
}

function Habits() {
  const all = useHabits(true);
  const areas = useAreas().filter((a) => !a.is_waste);
  const [showArchived, setShowArchived] = useState(false);
  const [title, setTitle] = useState('');
  const [area, setArea] = useState(areas[0]?.id ?? 'career');
  const list = all.filter((h) => h.archived === showArchived);
  const archivedN = all.filter((h) => h.archived).length;

  return (
    <Card
      title="반복 할 일"
      action={
        archivedN > 0 && (
          <Button onClick={() => setShowArchived(!showArchived)}>{showArchived ? '사용 중 보기' : `보관함 ${archivedN}`}</Button>
        )
      }
    >
      <p className="mb-2 text-xs text-zinc-400">
        정한 요일마다 오늘 목록에 자동으로 떠요 (일기, 학원, 운동 …). 오늘 화면에서 <b>“일기 매일 22:00 20분”</b>, <b>“학원 월수금 19:00 2h”</b>처럼 적어도 만들어져요.
      </p>
      <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
        {list.map((h) => (
          <HabitEditor key={h.id} habit={h} areas={areas} />
        ))}
        {list.length === 0 && <li className="py-3 text-sm text-zinc-400">{showArchived ? '보관한 반복 할 일이 없어요.' : '반복 할 일이 없어요.'}</li>}
      </ul>
      {!showArchived && (
        <form
          className="mt-3 flex gap-2 border-t border-zinc-100 pt-3 dark:border-zinc-800"
          onSubmit={(e) => {
            e.preventDefault();
            if (!title.trim()) return;
            addHabit(title.trim(), area);
            setTitle('');
          }}
        >
          <select value={area} onChange={(e) => setArea(e.target.value)} className={cn(fieldCls, 'h-9 w-24 shrink-0 px-2')} aria-label="범주">
            {areas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="새 반복 할 일" className={cn(fieldCls, 'h-9 min-w-0 flex-1 px-3')} />
          <Button type="submit" variant="primary" className="h-9 shrink-0">
            추가
          </Button>
        </form>
      )}
    </Card>
  );
}

function HabitEditor({ habit: h, areas }: { habit: Habit; areas: ReturnType<typeof useAreas> }) {
  const toggleDay = (i: number) => {
    const set = new Set(h.weekdays);
    if (set.has(i)) set.delete(i);
    else set.add(i);
    updateHabit(h.id, { weekdays: [...set].sort() });
  };
  return (
    <li className="space-y-2 py-3">
      <div className="flex gap-2">
        <select value={h.area_id} onChange={(e) => updateHabit(h.id, { area_id: e.target.value })} className={cn(fieldCls, 'h-8 w-24 shrink-0 px-2')} aria-label="범주">
          {areas.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <input value={h.title} onChange={(e) => updateHabit(h.id, { title: e.target.value })} className={cn(fieldCls, 'h-8 min-w-0 flex-1 px-3')} aria-label="반복 할 일 이름" />
        <Button aria-label={h.archived ? '복원' : '보관'} title={h.archived ? '복원' : '보관 (기록은 남아요)'} className="w-8 shrink-0 px-0" onClick={() => updateHabit(h.id, { archived: !h.archived })}>
          {h.archived ? <ArchiveRestore className="size-4" /> : <Archive className="size-4" />}
        </Button>
      </div>
      <div className="flex items-center gap-1">
        {DAY_LABELS.map((d, i) => {
          const on = h.weekdays.includes(i);
          return (
            <button
              key={d}
              onClick={() => toggleDay(i)}
              className={cn(
                'size-7 rounded-full text-xs font-medium transition',
                on ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900' : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800',
              )}
            >
              {d}
            </button>
          );
        })}
        <span className="ml-2 text-xs text-zinc-400">{h.weekdays.length === 0 ? '매일' : `주 ${h.weekdays.length}회`}</span>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
        시각
        <input type="time" value={h.time ?? ''} onChange={(e) => updateHabit(h.id, { time: e.target.value })} className={cn(fieldCls, 'h-8 px-2 text-xs')} aria-label="시각" />
        예상
        <select value={h.estimate ?? 0} onChange={(e) => updateHabit(h.id, { estimate: Number(e.target.value) })} className={cn(fieldCls, 'h-8 px-2 text-xs')} aria-label="예상 시간">
          {[0, 10, 15, 20, 30, 45, 60, 90, 120, 180].map((m) => (
            <option key={m} value={m}>
              {m ? fmtDur(m) : '모름'}
            </option>
          ))}
        </select>
      </div>
    </li>
  );
}

function TimeRange() {
  const { startHour, endHour } = useStore((s) => s.settings);
  const sel = cn(fieldCls, 'h-8 w-24 px-2');
  return (
    <Card title="하루 기록 막대 범위">
      <div className="flex items-center gap-2 text-sm">
        <select value={startHour} onChange={(e) => updateSettings({ startHour: Number(e.target.value) })} className={sel} aria-label="시작 시각">
          {Array.from({ length: 13 }, (_, h) => (
            <option key={h} value={h}>
              {h}시
            </option>
          ))}
        </select>
        부터
        <select value={endHour} onChange={(e) => updateSettings({ endHour: Number(e.target.value) })} className={sel} aria-label="끝 시각">
          {Array.from({ length: 7 }, (_, i) => 18 + i).map((h) => (
            <option key={h} value={h}>
              {h}시
            </option>
          ))}
        </select>
        까지
      </div>
    </Card>
  );
}

function DataBackup() {
  const file = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <Card title="백업">
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={exportData}>
          <Download className="size-4" /> JSON 내보내기
        </Button>
        <Button variant="outline" onClick={() => file.current?.click()}>
          <Upload className="size-4" /> 가져오기
        </Button>
        <input
          ref={file}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f) return;
            try {
              await importData(f);
              setMsg('가져왔어요.');
            } catch (err) {
              setMsg(err instanceof Error ? err.message : '가져오기에 실패했어요.');
            }
          }}
        />
      </div>
      {msg && <p className="mt-2 text-xs text-zinc-500">{msg}</p>}
    </Card>
  );
}
