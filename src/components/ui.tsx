import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { twMerge } from 'tailwind-merge';

/** 클래스 합치기 — 뒤에 온 클래스가 같은 속성의 앞 클래스를 덮어쓴다 (h-8 + h-9 → h-9) */
export const cn = (...c: (string | false | null | undefined)[]) => twMerge(c.filter(Boolean).join(' '));

export function Card({
  title,
  action,
  children,
  className,
}: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        'rounded-2xl border border-zinc-200/80 bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.03)] dark:border-zinc-800 dark:bg-zinc-900',
        className,
      )}
    >
      {(title || action) && (
        <header className="mb-3 flex min-h-7 items-center justify-between gap-2">
          <h2 className="text-[13px] font-semibold text-zinc-500 dark:text-zinc-400">{title}</h2>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'ghost' | 'outline' | 'primary' | 'danger' };

export function Button({ variant = 'ghost', className, ...props }: BtnProps) {
  return (
    <button
      {...props}
      className={cn(
        'inline-flex h-8 items-center justify-center gap-1.5 rounded-lg px-2.5 text-[13px] font-medium transition active:scale-[0.97] disabled:opacity-40',
        variant === 'ghost' && 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800',
        variant === 'outline' &&
          'border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800',
        variant === 'primary' &&
          'bg-zinc-900 text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300',
        variant === 'danger' && 'text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10',
        className,
      )}
    />
  );
}

export function Switch({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative h-6 w-10 shrink-0 rounded-full transition',
        checked ? 'bg-zinc-900 dark:bg-zinc-100' : 'bg-zinc-200 dark:bg-zinc-700',
      )}
    >
      <span
        className={cn(
          'absolute top-0.5 size-5 rounded-full bg-white shadow transition-all dark:bg-zinc-900',
          checked ? 'left-[18px]' : 'left-0.5',
        )}
      />
    </button>
  );
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-zinc-200/80 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{label}</div>
      <div className="mt-1 flex flex-wrap items-baseline gap-x-1.5">
        <span className="text-2xl font-bold tracking-tight whitespace-nowrap tabular-nums">{value}</span>
        {sub && <span className="text-xs whitespace-nowrap text-zinc-400 tabular-nums">{sub}</span>}
      </div>
    </div>
  );
}

/** 크기 없는 입력칸 스타일 — 너비·높이·패딩은 쓰는 곳에서 정한다 (Tailwind 클래스끼리 충돌하지 않게) */
export const fieldCls =
  'rounded-lg border border-zinc-200 bg-white text-sm placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-zinc-500';
export const inputCls = `${fieldCls} h-9 w-full px-3`;

export const textareaCls =
  'w-full resize-none rounded-xl border border-zinc-200 bg-zinc-50/60 px-3 py-2.5 text-sm leading-relaxed placeholder:text-zinc-400 focus:border-zinc-400 focus:bg-white focus:outline-none dark:border-zinc-800 dark:bg-zinc-950/40 dark:focus:border-zinc-600 dark:focus:bg-zinc-900';
