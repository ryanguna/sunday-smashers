import type { Metadata } from 'next'
import Link from 'next/link'

import { EmptyState, Snowfall } from '@/components/ui'
import { ShuttlecockIcon } from '@/components/icons'
import { DemoNotice } from '@/components/players/DemoNotice'
import { TabulatorInbox } from '@/components/scoresheet'
import { requireRole } from '@/lib/auth'

import { loadScoresheetIndex } from '../scoresheets/data'

export const metadata: Metadata = {
  title: 'Tabulator inbox',
  description: 'Verify signed scoresheets and clear what is outstanding.',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

/**
 * The tabulator's desk.
 *
 * Role-guarded, but `requireRole` resolves to a stand-in organiser in demo
 * mode, so this renders a full sample queue rather than bouncing — demo mode
 * is the only mode CI ever runs in, and an inbox that shows nothing there is
 * impossible to review.
 */
export default async function TabulatorPage() {
  await requireRole('tabulator', '/tabulator')

  const { demo, now, items, isTabulator, viewerName } = await loadScoresheetIndex()

  return (
    <main className="relative mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
      <Snowfall />

      <header className="mb-6 flex flex-col gap-2">
        <h1
          className="font-[family-name:var(--font-script)] text-4xl"
          style={{ color: 'var(--color-plum)' }}
        >
          Tabulator inbox
        </h1>
        <p className="max-w-2xl text-lg text-[var(--color-ink-soft)]">
          Signed sheets land here. Check each one against the rally log, then verify it — a result
          only counts towards the standings once you have.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {demo ? <DemoNotice /> : null}
          <Link
            href="/scoresheets"
            className="inline-flex items-center gap-1 rounded-[var(--radius-pill)] bg-[var(--color-brand-lilac-light)] px-3 py-1 text-xs font-extrabold text-[var(--color-plum)] inline-flex min-h-[24px] items-center underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-plum)]"
          >
            Browse every scoresheet →
          </Link>
        </div>
      </header>

      {items.length === 0 ? (
        <EmptyState
          icon={<ShuttlecockIcon size={30} />}
          title="Nothing on the desk yet"
          description="Sheets appear here as soon as both pairs have signed one. Put the kettle on."
        />
      ) : (
        <TabulatorInbox
          items={items}
          now={now}
          demo={demo}
          isTabulator={isTabulator}
          viewerName={viewerName || 'Tabulator'}
        />
      )}
    </main>
  )
}
