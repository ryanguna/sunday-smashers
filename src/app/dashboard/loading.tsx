import { Spinner } from '@/components/ui'

/** Festive placeholder while the dashboard's data resolves. */
export default function DashboardLoading() {
  return (
    <main className="mx-auto flex max-w-5xl flex-col items-center gap-3 px-4 py-24 text-center">
      <Spinner size={36} className="text-[var(--color-brand-pink-dark)]" />
      <p className="font-[family-name:var(--font-heading)] text-lg font-extrabold" style={{ color: 'var(--color-plum)' }}>
        Unwrapping your court sheet…
      </p>
      <p className="text-sm text-[var(--color-ink-soft)]">Fetching your matches, duties and standing. 🎄</p>
    </main>
  )
}
