import type { Metadata } from 'next'

import { EmptyState, Snowfall } from '@/components/ui'
import { ShuttlecockIcon } from '@/components/icons'
import { DemoNotice } from '@/components/players/DemoNotice'
import { ScoresheetIndexList } from '@/components/scoresheet'
import { requireAuth } from '@/lib/auth'

import { loadScoresheetIndex } from './data'

export const metadata: Metadata = {
  title: 'Scoresheets',
  description: 'Sign, submit and check the scoresheet for every finished match.',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

/**
 * Every finished match's sheet.
 *
 * Guarded, but `requireAuth` resolves to a stand-in organiser in demo mode, so
 * this renders the sample day rather than bouncing to a login page that cannot
 * work without Supabase.
 */
export default async function ScoresheetsPage() {
  await requireAuth('/scoresheets')

  const { demo, now, items, isTabulator, viewerName } = await loadScoresheetIndex()

  return (
    <main className="relative mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
      <Snowfall />

      <header className="mb-6 flex flex-col gap-2">
        <h1
          className="font-[family-name:var(--font-script)] text-4xl"
          style={{ color: 'var(--color-plum)' }}
        >
          Scoresheets
        </h1>
        <p className="max-w-2xl text-lg text-[var(--color-ink-soft)]">
          {viewerName ? `${viewerName}, every` : 'Every'} finished match has a sheet. Both pairs sign
          to agree the result, then the tabulator verifies it — only then does it count towards the
          standings.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {demo ? <DemoNotice /> : null}
          {isTabulator ? (
            <a
              href="/tabulator"
              className="inline-flex items-center gap-1 rounded-[var(--radius-pill)] bg-[var(--color-brand-lilac-light)] px-3 py-1 text-xs font-extrabold text-[var(--color-plum)] inline-flex min-h-[24px] items-center underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-plum)]"
            >
              Go to the tabulator inbox →
            </a>
          ) : null}
        </div>
      </header>

      {items.length === 0 ? (
        <EmptyState
          icon={<ShuttlecockIcon size={30} />}
          title="No finished matches yet"
          description="Scoresheets appear here the moment a match has a result. Until then, enjoy the mince pies."
        />
      ) : (
        <ScoresheetIndexList items={items} now={now} demo={demo} />
      )}
    </main>
  )
}
