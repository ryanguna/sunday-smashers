import { GiftIcon } from '@/components/icons'

/**
 * Shown on every auth page when Supabase env vars are absent. Demo mode
 * must never crash or hang — this renders instead of the real form.
 */
export function DemoModeNotice({ what = 'Authentication' }: { what?: string }) {
  return (
    <div className="rounded-[var(--radius-md)] bg-[var(--color-info-bg)] p-4 text-sm text-[var(--color-info)]">
      <p className="flex items-center gap-2 font-[family-name:var(--font-heading)] font-bold">
        <GiftIcon size={18} aria-hidden="true" />
        Demo mode
      </p>
      <p className="mt-1.5">
        {what} isn&apos;t configured in this demo — no Supabase project is connected, so sign-in,
        sign-up, and profile saving are disabled. Everything else (schedule, standings, rules) still
        works.
      </p>
    </div>
  )
}

export function AlertBanner({
  variant = 'danger',
  children,
}: {
  variant?: 'danger' | 'success' | 'info'
  children: React.ReactNode
}) {
  const classes =
    variant === 'success'
      ? 'bg-[var(--color-success-bg)] text-[var(--color-success)]'
      : variant === 'info'
        ? 'bg-[var(--color-info-bg)] text-[var(--color-info)]'
        : 'bg-[var(--color-danger-bg)] text-[var(--color-danger)]'
  return (
    <div role="alert" className={`mb-4 rounded-[var(--radius-md)] p-3.5 text-sm font-medium ${classes}`}>
      {children}
    </div>
  )
}
