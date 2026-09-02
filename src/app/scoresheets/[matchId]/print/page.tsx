import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { PrintableScoresheet, PrintButton } from '@/components/scoresheet'
import { requireAuth } from '@/lib/auth'

import { loadScoresheet } from '../../data'

export const metadata: Metadata = {
  title: 'Printable scoresheet',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

/** The tournament runs in Sydney; the papers are filed in Sydney time. */
const TIME_ZONE = 'Australia/Sydney'

/**
 * The paper copy.
 *
 * Deliberately a Server Component with no interactivity beyond the print
 * button: the timestamps are formatted once, on the server, in an explicit
 * timezone, so what is on the screen is exactly what comes out of the printer
 * and no browser in another timezone gets to disagree with it.
 */
export default async function PrintScoresheetPage({
  params,
}: {
  params: Promise<{ matchId: string }>
}) {
  const { matchId } = await params
  await requireAuth(`/scoresheets/${matchId}/print`)

  const data = await loadScoresheet(matchId)
  if (!data) notFound()

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 print:max-w-none print:px-0 print:py-0">
      <div
        data-print-hide
        className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-lg)] border-2 border-[var(--color-brand-lilac-light)] bg-white p-3"
      >
        <div>
          <p
            className="font-[family-name:var(--font-heading)] text-base font-extrabold"
            style={{ color: 'var(--color-plum)' }}
          >
            Paper copy
          </p>
          <p className="text-sm text-[var(--color-ink-soft)]">
            Prints on A4. Unsigned pairs get ruled lines to sign by hand.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <PrintButton />
          <Link
            href={`/scoresheets/${encodeURIComponent(matchId)}`}
            className="inline-flex items-center rounded-[var(--radius-pill)] px-3 py-1.5 text-sm font-semibold text-[var(--color-brand-lilac-dark)] inline-flex min-h-[24px] items-center underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-plum)]"
          >
            ← Back to the sheet
          </Link>
        </div>
      </div>

      <PrintableScoresheet
        matchId={data.match.id}
        divisionName={data.divisionName}
        stage={data.stage}
        court={data.match.court ?? 'Court TBC'}
        slotLabel={data.match.slotLabel ?? 'Time TBC'}
        config={data.config}
        board={data.board}
        rallies={data.rallies}
        rallySource={data.rallySource}
        ending={data.ending}
        sheet={data.sheet}
        officials={data.officials}
        printedAtMs={data.now}
        timeZone={TIME_ZONE}
      />
    </main>
  )
}
