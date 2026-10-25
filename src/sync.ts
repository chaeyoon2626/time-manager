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

/**
 * 타이머를 끝내기 직전에 서버의 타이머 기록을 먼저 받아온다.
 * 다른 기기에서 이미 끈 타이머를 이 기기가 "아직 켜져 있다"고 보고 지금 시각으로 덮어쓰지 않게.
 * 오프라인이거나 로그인 전이면 그냥 넘어간다. 최대 timeoutMs만 기다린다.
 */
export async function refreshSessions(timeoutMs = 1500) {
  if (!supabase || !navigator.onLine || !useStore.getState().hydrated) return;
  const { data } = await supabase.auth.getSession();
  if (!data.session) return;
  await Promise.race([pull(['sessions']).catch(() => {}), new Promise((r) => setTimeout(r, timeoutMs))]);
}

async function pull(tables: TableName[] = TABLES) {
  for (const t of tables) {
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
    // 다시 보면 받아오고, 다른 앱으로 넘어가거나 닫을 때는 남은 변경을 바로 올린다
    if (document.visibilityState === 'visible') scheduleSync(0);
    else void syncNow();
  });
  window.addEventListener('online', () => scheduleSync(0));
  setInterval(() => {
    if (document.visibilityState === 'visible') scheduleSync(0);
  }, 30_000);
}
