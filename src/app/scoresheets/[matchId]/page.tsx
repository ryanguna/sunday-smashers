import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { Snowfall } from '@/components/ui'
import { DemoNotice } from '@/components/players/DemoNotice'
import { OfficialsPanel, RallyLog, ScoreSummary, ScoresheetPanel } from '@/components/scoresheet'
import { requireAuth } from '@/lib/auth'
import { scoreForSide, sideName } from '@/lib/scoring'

import { loadScoresheet } from '../data'

export const metadata: Metadata = {
  title: 'Scoresheet',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

/**
 * One match's sheet: what happened, under which rules, who officiated, who has
 * signed, and where it is in the chain of custody.
 *
 * All Supabase access happens here on the server. The client panel below gets
 * plain data, which is what keeps `next/headers` out of the browser bundle.
 */
export default async function ScoresheetPage({
  params,
}: {
  params: Promise<{ matchId: string }>
}) {
  const { matchId } = await params
  await requireAuth(`/scoresheets/${matchId}`)

  const data = await loadScoresheet(matchId)
  if (!data) notFound()

  const {
    demo,
    now,
    match,
    divisionName,
    stage,
    config,
    board,
    rallies,
    rallySource,
    ending,
    sheet,
    officials,
    viewer,
    matchComplete,
  } = data

  const teamAName = sideName(config, 'a')
  const teamBName = sideName(config, 'b')
  const matchLabel = `${teamAName} v ${teamBName}`
  const winnerName = board.winner ? sideName(config, board.winner) : ''

  return (
    <main className="relative mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
      <Snowfall />

      <header className="mb-6 flex flex-col gap-2">
        <Link
          href="/scoresheets"
          className="inline-flex w-fit items-center gap-1 rounded-[var(--radius-pill)] px-1 text-sm font-semibold text-[var(--color-brand-lilac-dark)] inline-flex min-h-[24px] items-center underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-plum)]"
        >
          ← All scoresheets
        </Link>
        <h1
          className="font-[family-name:var(--font-heading)] text-3xl font-extrabold leading-tight"
          style={{ color: 'var(--color-plum)' }}
        >
          {matchLabel}
        </h1>
        <p className="text-sm font-semibold text-[var(--color-ink-muted)]">
          {divisionName} · {stage} · {match.court ?? 'Court TBC'} · {match.slotLabel ?? 'Time TBC'}
        </p>
        {viewer.side ? (
          <p className="text-sm text-[var(--color-ink-soft)]">
            You are playing for {sideName(config, viewer.side)} in this match.
          </p>
        ) : viewer.isOfficial ? (
          <p className="text-sm text-[var(--color-ink-soft)]">
            You were on duty for this match.
          </p>
        ) : null}
        {demo ? <DemoNotice className="self-start" /> : null}
      </header>

      <div className="flex flex-col gap-8">
        <ScoreSummary board={board} config={config} ending={ending} />

        <ScoresheetPanel
          matchId={match.id}
          matchLabel={matchLabel}
          config={config}
          sheet={sheet}
          scoreA={scoreForSide(board, 'a')}
          scoreB={scoreForSide(board, 'b')}
          winnerName={winnerName}
          matchComplete={matchComplete}
          demo={demo}
          now={now}
          isTabulator={viewer.isTabulator}
          viewerName={viewer.name || 'Someone'}
          viewerId={viewer.id}
          isOfficial={viewer.isOfficial}
        />

        <OfficialsPanel officials={officials} />

        <RallyLog
          rows={rallies}
          source={rallySource}
          teamAName={teamAName}
          teamBName={teamBName}
        />
      </div>
    </main>
  )
}
