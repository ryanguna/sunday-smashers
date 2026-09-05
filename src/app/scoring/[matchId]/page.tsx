import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { Snowfall } from '@/components/ui'
import { DemoNotice } from '@/components/players/DemoNotice'
import { ScoringConsole } from '@/components/scoring'
import { requireApprovedPlayer } from '@/lib/registration-gate-server'
import { dutyRoleLabel, stageLabel } from '@/lib/dashboard'

import { loadScoringMatch } from '../data'

export const metadata: Metadata = {
  title: 'Scoring a match',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

/**
 * The per-match console. All Supabase access happens here on the server; the
 * client components below receive plain data, which keeps `next/headers` out
 * of the browser bundle.
 */
export default async function ScoringMatchPage({
  params,
}: {
  params: Promise<{ matchId: string }>
}) {
  const { matchId } = await params
  await requireApprovedPlayer(`/scoring/${matchId}`)

  const data = await loadScoringMatch(matchId)
  if (!data) notFound()

  const { demo, match, roles, canScore, clash, state, startedAtMs, revision, now } = data
  const teams = `${match.teamA?.name ?? match.sourceA ?? 'TBC'} v ${match.teamB?.name ?? match.sourceB ?? 'TBC'}`
  const contextLabel = [
    match.court ?? 'Court TBC',
    match.slotLabel ?? 'Time TBC',
    stageLabel(match.stage),
  ].join(' · ')

  return (
    <main className="relative mx-auto w-full max-w-3xl px-3 py-5 sm:px-6 sm:py-8">
      <Snowfall />

      <div className="mb-4 flex flex-col gap-2">
        <Link
          href="/scoring"
          className="inline-flex w-fit items-center gap-1 rounded-[var(--radius-pill)] px-1 text-sm font-semibold text-[var(--color-brand-lilac-dark)] inline-flex min-h-[24px] items-center underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-plum)]"
        >
          ← All my duties
        </Link>
        <h1
          className="font-[family-name:var(--font-heading)] text-3xl font-extrabold leading-tight"
          style={{ color: 'var(--color-plum)' }}
        >
          {teams}
        </h1>
        <p className="text-sm font-semibold text-[var(--color-ink-muted)]">
          {roles.length > 0 ? `Your duty: ${roles.map(dutyRoleLabel).join(' & ')}` : 'Not on duty'}
        </p>
        {clash ? (
          <p className="rounded-[var(--radius-md)] border-2 border-[var(--color-warn)] bg-[var(--color-warn-bg)] px-3 py-2 text-sm font-semibold text-[var(--color-ink-soft)]">
            Heads up — the roster also has you playing in this time slot. Find a swap before the
            match starts.
          </p>
        ) : null}
        {demo ? <DemoNotice className="self-start" /> : null}
      </div>

      <ScoringConsole
        initialState={state}
        demo={demo}
        canScore={canScore}
        now={now}
        startedAtMs={startedAtMs}
        revision={revision}
        contextLabel={contextLabel}
      />
    </main>
  )
}
