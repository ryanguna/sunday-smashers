'use client'

import { useMemo, useState, useTransition } from 'react'

import { cn } from '@/lib/cn'
import { Button, Card, Confetti, EmptyState, useToast } from '@/components/ui'
import {
  BaubleIcon,
  GiftIcon,
  MedalIcon,
  RacketIcon,
  ShuttlecockIcon,
  SnowflakeIcon,
  TrophyIcon,
} from '@/components/icons'
import {
  computeStandings,
  finalPlacings,
  generateKnockout,
  qualifiers,
  type KnockoutFixture,
  type PlayedMatch,
} from '@/lib/draw'
import {
  applyManualTiebreaks,
  knockoutReadiness,
  publishSafety,
  roundRobinProgress,
  unresolvedTieGroups,
  type ManualTiebreak,
} from '@/lib/draw-admin'
import type { DrawDivisionData } from '@/app/admin/draw/data'
import { publishKnockoutAction, recordTiebreakDecisionAction } from '@/app/admin/draw/actions'
import { DivisionSwitcher } from './DivisionSwitcher'
import { DrawAlert, DrawStat, PanelHeading, ProgressBar } from './DrawUI'
import { PublishDrawModal, type PublishConfirmation } from './PublishDrawModal'
import { StandingsInspector, TiebreakResolver } from './StandingsInspector'

/**
 * `/admin/draw/knockout` — standings, tiebreak inspector and the bracket.
 *
 * The ranking, the qualifiers and the bracket shape all come straight from
 * `src/lib/draw.ts`; this component only feeds it the recorded results plus
 * any manual tiebreak calls, and renders the preview → publish flow.
 */
export function KnockoutWorkbench({
  divisions,
  isDemo,
}: {
  divisions: DrawDivisionData[]
  isDemo: boolean
}) {
  const [activeId, setActiveId] = useState(divisions[0]?.id ?? '')
  const [localDecisions, setLocalDecisions] = useState<Record<string, ManualTiebreak[]>>({})
  const [modalOpen, setModalOpen] = useState(false)
  const [celebrating, setCelebrating] = useState(false)
  const [pending, startTransition] = useTransition()
  const { toast } = useToast()

  const division = divisions.find((item) => item.id === activeId) ?? divisions[0]

  const teamMap = useMemo(
    () => new Map((division?.teams ?? []).map((team) => [team.id, team] as const)),
    [division]
  )

  const decisions = useMemo(
    () => [...(localDecisions[division?.id ?? ''] ?? []), ...(division?.manualTiebreaks ?? [])],
    [localDecisions, division]
  )

  const rawStandings = useMemo(() => {
    if (!division) return []
    const drawn = new Set<string>()
    for (const match of division.playedElims) {
      drawn.add(match.teamA)
      drawn.add(match.teamB)
    }
    const teamIds = division.teams
      .map((team) => team.id)
      .filter((id) => drawn.has(id) || division.publishedElims.length > 0)
    if (teamIds.length === 0) return []
    try {
      return computeStandings(teamIds, division.playedElims, division.elimsRules)
    } catch {
      return []
    }
  }, [division])

  const standings = useMemo(
    () => applyManualTiebreaks(rawStandings, decisions),
    [rawStandings, decisions]
  )

  const tieGroups = useMemo(() => unresolvedTieGroups(standings), [standings])

  if (!division) {
    return (
      <EmptyState
        icon={<SnowflakeIcon size={30} />}
        title="No divisions yet"
        description="Once a division exists and its round robin is drawn, the bracket lives here."
      />
    )
  }

  const progress = roundRobinProgress(
    division.publishedElims.length,
    division.publishedElims.filter((match) => match.hasResult).length
  )
  const readiness = knockoutReadiness(progress, standings, decisions, division.qualifyingPlaces)
  const top = qualifiers(standings, division.qualifyingPlaces)
  const safety = publishSafety(division.publishedKnockout)

  const results = { m1: division.knockoutResults.M1, m2: division.knockoutResults.M2 }
  const bracket = readiness.ready
    ? generateKnockout(standings, results, division.finalsRules, division.qualifyingPlaces)
    : []
  const placings = finalPlacings(
    division.knockoutResults.FINAL,
    division.knockoutResults.THIRD,
    division.finalsRules
  )

  function resolveTie(teamIds: string[], note: string) {
    startTransition(async () => {
      const result = await recordTiebreakDecisionAction({
        divisionId: division.id,
        teamIds,
        note: note || undefined,
      })
      setLocalDecisions((current) => ({
        ...current,
        [division.id]: [{ teamIds, note: note || undefined }, ...(current[division.id] ?? [])],
      }))
      toast({
        title: result.ok ? 'Tie settled ⚖️' : result.demo ? 'Demo mode' : 'Not saved',
        description: result.ok
          ? result.message
          : `${result.message} The order below is applied for this session only.`,
        variant: result.ok ? 'festive' : 'warning',
      })
    })
  }

  function publish(confirmation: PublishConfirmation) {
    startTransition(async () => {
      const result = await publishKnockoutAction({
        divisionId: division.id,
        rankedTeamIds: standings.map((row) => row.teamId),
        rules: division.finalsRules,
        qualifyingPlaces: division.qualifyingPlaces,
        ...confirmation,
      })

      if (result.ok || result.demo) {
        setModalOpen(false)
        setCelebrating(true)
        setTimeout(() => setCelebrating(false), 4000)
      }
      toast({
        title: result.ok ? 'Bracket published! 🏆' : result.demo ? 'Demo mode' : 'Not published',
        description: result.message,
        variant: result.ok ? 'festive' : result.demo ? 'warning' : 'danger',
        duration: 7000,
      })
    })
  }

  return (
    <div>
      <Confetti active={celebrating} count={64} />

      <DivisionSwitcher
        options={divisions.map((item) => ({
          id: item.id,
          name: item.name,
          hint: `${item.publishedKnockout.length > 0 ? 'bracket published' : 'no bracket yet'}`,
        }))}
        activeId={division.id}
        onChange={setActiveId}
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <DrawStat
          label="Round robin"
          value={`${progress.played}/${progress.total}`}
          hint={progress.complete ? 'Complete 🎉' : `${progress.remaining} still to play`}
          icon={<ShuttlecockIcon size={18} />}
          tone={progress.complete ? 'mint' : 'pink'}
        />
        <DrawStat
          label="Qualifying places"
          value={division.qualifyingPlaces}
          hint="Rank 1 v 4, Rank 2 v 3"
          icon={<MedalIcon size={18} />}
          tone="gold"
        />
        <DrawStat
          label="Semis & finals"
          value={`${division.finalsRules.pointsToWin} pts`}
          hint={division.finalsRules.deuce ? 'Deuce enabled' : 'No deuce'}
          icon={<BaubleIcon size={18} />}
          tone="lilac"
        />
        <DrawStat
          label="Unresolved ties"
          value={tieGroups.length}
          hint={tieGroups.length === 0 ? 'Every place is settled' : 'Needs your decision'}
          icon={<SnowflakeIcon size={18} />}
          tone={tieGroups.length === 0 ? 'mint' : 'pink'}
        />
      </div>

      <Card variant="frosted" className="mb-4">
        <ProgressBar
          percent={progress.percent}
          label={`${division.name} round robin progress`}
        />
        {!readiness.ready && readiness.reason && (
          <DrawAlert
            level="warn"
            title="The bracket is not ready yet"
            detail={readiness.reason}
            className="mt-3"
          />
        )}
      </Card>

      {tieGroups.length > 0 && (
        <div className="mb-4 flex flex-col gap-3">
          {tieGroups.map((group) => (
            <TiebreakResolver
              key={group.teamIds.join('|')}
              group={group}
              teams={teamMap}
              onResolve={resolveTie}
              busy={pending}
            />
          ))}
        </div>
      )}

      <Card variant="candy-stripe" className="mb-4">
        <PanelHeading
          icon={<RacketIcon size={18} className="text-[var(--color-brand-pink-dark)]" />}
          title="Standings & tiebreak inspector"
          description="Wins first, then head to head. Each row shows exactly which rule put it there."
        />
        {standings.length === 0 ? (
          <EmptyState
            icon={<ShuttlecockIcon size={30} />}
            title="No results yet"
            description="Publish the round robin and record some scores — the ladder builds itself from there."
            action={
              <Button href="/admin/draw" variant="secondary">
                Back to the draw
              </Button>
            }
          />
        ) : (
          <StandingsInspector
            standings={standings}
            teams={teamMap}
            qualifyingPlaces={division.qualifyingPlaces}
          />
        )}
      </Card>

      <Card variant="frosted">
        <PanelHeading
          icon={<TrophyIcon size={18} className="text-[var(--color-brand-gold-dark)]" />}
          title="Knockout bracket"
          description="Top four go through. Semi losers meet in the Battle for 3rd, winners in the Championship."
          actions={
            readiness.ready ? (
              <Button
                variant={safety.destructive ? 'danger' : 'festive'}
                size="sm"
                onClick={() => setModalOpen(true)}
              >
                <GiftIcon size={16} aria-hidden="true" />
                {safety.existingCount > 0 ? 'Republish bracket' : 'Publish bracket'}
              </Button>
            ) : undefined
          }
        />

        {safety.existingCount > 0 && (
          <DrawAlert
            level={safety.level}
            title={safety.headline}
            detail={safety.detail}
            className="mb-3"
          />
        )}

        {bracket.length === 0 ? (
          <EmptyState
            icon={<TrophyIcon size={30} />}
            title="Bracket not drawn yet"
            description={readiness.reason ?? 'Finish the round robin to see who goes through.'}
          />
        ) : (
          <>
            <ul className="mb-3 flex flex-wrap gap-2">
              {top.map((row) => (
                <li
                  key={row.teamId}
                  className="flex items-center gap-1.5 rounded-[var(--radius-pill)] bg-[var(--color-brand-gold-light)] px-3 py-1 text-sm font-bold text-[var(--color-brand-gold-dark)]"
                >
                  <MedalIcon size={14} aria-hidden="true" />
                  {row.rank}. {teamMap.get(row.teamId)?.name ?? row.teamId}
                </li>
              ))}
            </ul>
            <div className="grid gap-3 sm:grid-cols-2">
              {bracket.map((fixture) => (
                <BracketCard
                  key={fixture.key}
                  fixture={fixture}
                  nameOf={(id) => teamMap.get(id)?.name ?? id}
                  result={division.knockoutResults[fixture.key]}
                />
              ))}
            </div>
          </>
        )}

        {placings.champion && (
          <div className="mt-4 rounded-[var(--radius-lg)] bg-[image:var(--gradient-gold)] p-[2px]">
            <div className="rounded-[calc(var(--radius-lg)-2px)] bg-white/90 p-4">
              <h3 className="mb-2 flex items-center gap-2 font-[family-name:var(--font-heading)] text-lg font-extrabold text-[var(--color-plum)]">
                <TrophyIcon size={20} className="text-[var(--color-brand-gold-dark)]" aria-hidden="true" />
                Final placings
              </h3>
              <ol className="grid gap-1.5 sm:grid-cols-2">
                {(
                  [
                    ['Champion', placings.champion],
                    ['Runner-up', placings.runnerUp],
                    ['Third', placings.third],
                    ['Fourth', placings.fourth],
                  ] as const
                ).map(([label, teamId]) => (
                  <li
                    key={label}
                    className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] bg-[var(--color-frost-100)] px-3 py-2 text-sm"
                  >
                    <span className="font-bold text-[var(--color-ink-muted)]">{label}</span>
                    <span className="min-w-0 truncate font-bold text-[var(--color-plum)]">
                      {teamId ? (teamMap.get(teamId)?.name ?? teamId) : 'To be decided'}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        )}
      </Card>

      <PublishDrawModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onConfirm={publish}
        existing={division.publishedKnockout}
        kind="knockout"
        fixtureCount={bracket.length}
        divisionName={division.name}
        busy={pending}
      />

      {isDemo && (
        <p className="mt-4 text-center text-xs text-[var(--color-ink-muted)]">
          Demo mode — the bracket is computed from the sample results and never written.
        </p>
      )}
    </div>
  )
}

function BracketCard({
  fixture,
  nameOf,
  result,
}: {
  fixture: KnockoutFixture
  nameOf: (id: string) => string
  result?: PlayedMatch
}) {
  const sides = [
    { teamId: fixture.teamA, source: fixture.sourceA, score: result?.pointsA },
    { teamId: fixture.teamB, source: fixture.sourceB, score: result?.pointsB },
  ]
  const winner =
    result && result.pointsA !== result.pointsB
      ? result.pointsA > result.pointsB
        ? fixture.teamA
        : fixture.teamB
      : null

  return (
    <div className="rounded-[var(--radius-md)] bg-white p-3 shadow-[var(--shadow-soft)]">
      <p className="mb-2 flex items-center gap-1.5 font-[family-name:var(--font-heading)] text-sm font-extrabold text-[var(--color-plum)]">
        <ShuttlecockIcon size={15} className="text-[var(--color-brand-pink-dark)]" aria-hidden="true" />
        {fixture.label}
        <span className="ml-auto rounded-[var(--radius-pill)] bg-[var(--color-brand-lilac-light)] px-2 py-0.5 text-[0.65rem] font-bold text-[var(--color-brand-lilac-dark)]">
          {fixture.key}
        </span>
      </p>
      <div className="flex flex-col gap-1">
        {sides.map((side, index) => (
          <div
            key={index}
            className={cn(
              'flex items-center justify-between gap-3 rounded-[var(--radius-sm)] px-2.5 py-1.5 text-sm',
              side.teamId && winner === side.teamId
                ? 'bg-[var(--color-success-bg)]'
                : 'bg-[var(--color-frost-100)]'
            )}
          >
            <span
              className={cn(
                'min-w-0 truncate font-bold',
                side.teamId ? 'text-[var(--color-plum)]' : 'italic text-[var(--color-ink-muted)]'
              )}
            >
              {side.teamId ? nameOf(side.teamId) : side.source}
            </span>
            {side.score != null && (
              <span className="shrink-0 font-extrabold tabular-nums text-[var(--color-ink-soft)]">
                {side.score}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
