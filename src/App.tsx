import { useCallback, useEffect, useState } from 'react';
import { CalendarCheck2, CalendarRange, Settings as SettingsIcon, Sparkles } from 'lucide-react';
import { BucketList } from './components/BucketList';
import { SyncBadge } from './components/SyncBadge';
import { cn } from './components/ui';
import { todayKey } from './lib/date';
import { SettingsPage } from './pages/Settings';
import { TodayPage } from './pages/Today';
import { WeekPage } from './pages/Week';
import { useStore } from './store';

const TABS = [
  { id: 'today', label: '오늘', icon: CalendarCheck2 },
  { id: 'week', label: '이번 주', icon: CalendarRange },
  { id: 'settings', label: '설정', icon: SettingsIcon },
] as const;
type Tab = (typeof TABS)[number]['id'];

const readHash = (): Tab => {
  const h = location.hash.slice(1);
  return TABS.some((t) => t.id === h) ? (h as Tab) : 'today';
};

function useHashTab(): [Tab, (t: Tab) => void] {
  const [tab, setTab] = useState(readHash);
  useEffect(() => {
    const f = () => {
      setTab(readHash());
      window.scrollTo({ top: 0 });
    };
    window.addEventListener('hashchange', f);
    return () => window.removeEventListener('hashchange', f);
  }, []);
  return [tab, (t) => (location.hash = t)];
}

export default function App() {
  const hydrated = useStore((s) => s.hydrated);
  const [tab, go] = useHashTab();
  const [date, setDate] = useState(todayKey);
  const [bucketOpen, setBucketOpen] = useState(false);
  const closeBucket = useCallback(() => setBucketOpen(false), []);

  if (!hydrated) return <div className="grid h-dvh place-items-center text-sm text-zinc-400">불러오는 중…</div>;

  return (
    <div className="min-h-dvh pb-[calc(76px+env(safe-area-inset-bottom))] md:pb-12">
      <header className="sticky top-0 z-30 border-b border-zinc-200/70 bg-zinc-50/85 pt-[env(safe-area-inset-top)] backdrop-blur-md dark:border-zinc-800/80 dark:bg-zinc-950/85">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4">
          <a href="#today" className="flex items-center gap-2 font-bold tracking-tight">
            <img src="/favicon.svg" alt="" className="size-6" />
            시간관리
          </a>
          <nav className="hidden items-center gap-1 md:flex">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => go(t.id)}
                className={cn(
                  'rounded-lg px-3 py-1.5 text-sm font-medium transition',
                  tab === t.id
                    ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                    : 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100',
                )}
              >
                {t.label}
              </button>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-1">
            <SyncBadge onClick={() => go('settings')} />
            <button
              onClick={() => setBucketOpen(true)}
              className="flex h-8 items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-2.5 text-[13px] font-medium text-zinc-700 transition hover:bg-zinc-50 active:scale-[0.97] dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              <Sparkles className="size-4 text-amber-500" />
              버킷리스트
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pt-5">
        {tab === 'today' && <TodayPage date={date} setDate={setDate} />}
        {tab === 'week' && <WeekPage date={date} setDate={setDate} />}
        {tab === 'settings' && <SettingsPage />}
      </main>

      {bucketOpen && <BucketList onClose={closeBucket} />}

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-zinc-200/70 bg-white/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden dark:border-zinc-800 dark:bg-zinc-950/90">
        <div className="grid grid-cols-3">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => go(id)}
              className={cn(
                'flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium',
                tab === id ? 'text-zinc-900 dark:text-zinc-100' : 'text-zinc-400',
              )}
            >
              <Icon className="size-[22px]" strokeWidth={tab === id ? 2.3 : 1.8} />
              {label}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
