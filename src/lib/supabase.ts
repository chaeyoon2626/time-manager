import { createClient } from '@supabase/supabase-js';

// Supabase의 Connect 화면이 보여주는 NEXT_PUBLIC_ 이름 그대로 붙여넣어도 읽는다
const env = import.meta.env;
const url = (env.VITE_SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL) as string | undefined;
const key = (env.VITE_SUPABASE_KEY ?? env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) as string | undefined;

/** .env.local 이 없으면 null → 이 기기에만 저장하는 로컬 모드 */
export const supabase = url && key ? createClient(url, key) : null;
