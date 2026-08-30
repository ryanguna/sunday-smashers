import type { ReactNode } from 'react'
import { Spinner } from './Spinner'

export interface LoadingScreenProps {
  /** Festive headline, e.g. "Chalking up the court…" */
  title: ReactNode
  /** One line saying what is actually being fetched. */
  detail: ReactNode
}

/**
 * Shared route-level loading state.
 *
 * Every `loading.tsx` renders this rather than restating the markup, so the
 * spinner, spacing and type stay consistent — only the copy changes per page.
 */
export function LoadingScreen({ title, detail }: LoadingScreenProps) {
  return (
    <main
      className="mx-auto flex max-w-5xl flex-col items-center gap-3 px-4 py-24 text-center"
      aria-busy="true"
    >
      <Spinner size={36} className="text-[var(--color-brand-pink-dark)]" />
      <p className="font-[family-name:var(--font-heading)] text-lg font-extrabold text-[var(--color-plum)]">
        {title}
      </p>
      <p className="text-sm text-[var(--color-ink-soft)]">{detail}</p>
    </main>
  )
}
