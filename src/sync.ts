import { supabase } from './lib/supabase';
import { TABLES, type TableName } from './lib/types';
import { setOnChange, useStore } from './store';

const PAGE = 1000;
const CHUNK = 500;

let timer: ReturnType<typeof setTimeout> | undefined;
let running = false;
let again = false;

export function scheduleSync(delay = 1000) {
  if (!supabase) return;
  clearTimeout(timer);
  timer = setTimeout(syncNow, delay);
}

export async function syncNow() {
  if (!supabase) return;
  if (!useStore.getState().hydrated) return scheduleSync(300);
  if (running) {
    again = true;
    return;
  }
  const { data } = await supabase.auth.getSession();
  const session = data.session;
  if (!session) return useStore.setState({ syncStatus: 'signed-out' });
  if (!navigator.onLine) return useStore.setState({ syncStatus: 'offline' });

  running = true;
  useStore.setState({ syncStatus: 'syncing', syncError: null });
  try {
    await push(session.user.id);
    await pull();
    useStore.setState({ syncStatus: 'synced', lastSyncedAt: new Date().toISOString() });
  } catch (e) {
    useStore.setState({ syncStatus: 'error', syncError: e instanceof Error ? e.message : String(e) });
  } finally {
    running = false;
    if (again) {
      again = false;
      scheduleSync(300);
    }
  }
}

const splitKey = (k: string) => {
  const i = k.indexOf(':');
  return [k.slice(0, i) as TableName, k.slice(i + 1)] as const;
};

async function push(userId: string) {
  const { data, dirty } = useStore.getState();
  const byTable: Partial<Record<TableName, object[]>> = {};
  const sent: Record<string, string> = {};
  for (const key of Object.keys(dirty)) {
    const [t, id] = splitKey(key);
    const row = data[t]?.[id];
    if (!row) continue;
    (byTable[t] ??= []).push({ ...row, user_id: userId });
    sent[key] = row.updated_at;
  }
  for (const t of TABLES) {
    const rows = byTable[t];
    if (!rows) continue;
    for (let i = 0; i < rows.length; i += CHUNK) {
      // defaultToNull: false → 예전 행에 없는 칸(예: activity_id)은 null 대신 DB 기본값으로
      const { error } = await supabase!
        .from(t)
        .upsert(rows.slice(i, i + CHUNK), { onConflict: 'user_id,id', defaultToNull: false });
      if (error) throw error;
    }
  }
  // 보내는 동안 또 수정된 행은 dirty로 남긴다
  useStore.setState((s) => {
    const next = { ...s.dirty };
    for (const [key, at] of Object.entries(sent)) {
      const [t, id] = splitKey(key);
      if (s.data[t][id]?.updated_at === at) delete next[key];
    }
    return { dirty: next };
  });
}

async function pull() {
  for (const t of TABLES) {
    let cursor = useStore.getState().cursors[t];
    for (;;) {
      let q = supabase!.from(t).select('*').order('synced_at', { ascending: true }).limit(PAGE);
      if (cursor) q = q.gt('synced_at', cursor);
      const { data: rows, error } = await q;
      if (error) throw error;
      if (!rows.length) break;
      merge(t, rows);
      cursor = rows[rows.length - 1].synced_at as string;
      useStore.setState((s) => ({ cursors: { ...s.cursors, [t]: cursor } }));
      if (rows.length < PAGE) break;
    }
  }
}

/** 서버 값과 로컬 값 중 updated_at이 최신인 쪽이 이긴다 */
function merge(t: TableName, rows: Record<string, unknown>[]) {
  useStore.setState((s) => {
    const table = { ...s.data[t] } as Record<string, unknown>;
    const dirty = { ...s.dirty };
    for (const raw of rows) {
      const { user_id: _u, synced_at: _s, ...row } = raw;
      const id = row.id as string;
      const updated_at = new Date(row.updated_at as string).toISOString();
      const local = s.data[t][id];
      const key = `${t}:${id}`;
      if (local && dirty[key] && Date.parse(local.updated_at) > Date.parse(updated_at)) continue;
      table[id] = { ...row, updated_at };
      delete dirty[key];
    }
    return { data: { ...s.data, [t]: table }, dirty };
  });
}

export function initSync() {
  setOnChange(() => scheduleSync());
  if (!supabase) return useStore.setState({ syncStatus: 'local' });

  useStore.setState({ syncStatus: 'signed-out' });
  supabase.auth.onAuthStateChange((event, session) => {
    useStore.setState({ userEmail: session?.user.email ?? null });
    if (event === 'SIGNED_OUT') {
      useStore.setState({ cursors: {}, syncStatus: 'signed-out' });
    } else if (session) {
      scheduleSync(0);
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') scheduleSync(0);
  });
  window.addEventListener('online', () => scheduleSync(0));
  setInterval(() => {
    if (document.visibilityState === 'visible') scheduleSync(0);
  }, 30_000);
}
