import { useStore, type SyncStatus } from '../store';
import { cn } from './ui';

const LABEL: Record<SyncStatus, [string, string]> = {
  local: ['이 기기에 저장', 'bg-zinc-400'],
  'signed-out': ['로그인 필요', 'bg-amber-500'],
  syncing: ['동기화 중', 'bg-sky-500 animate-pulse'],
  synced: ['동기화됨', 'bg-emerald-500'],
  offline: ['오프라인', 'bg-zinc-400'],
  error: ['동기화 오류', 'bg-rose-500'],
};

export function SyncBadge({ onClick }: { onClick: () => void }) {
  const status = useStore((s) => s.syncStatus);
  const pending = useStore((s) => Object.keys(s.dirty).length);
  const [label, dot] = LABEL[status];
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 rounded-full px-2.5 py-1 text-xs font-medium text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
    >
      <span className={cn('size-2 rounded-full', dot)} />
      {label}
      {status !== 'local' && pending > 0 && status !== 'syncing' && (
        <span className="tabular-nums text-zinc-400">· 대기 {pending}</span>
      )}
    </button>
  );
}
