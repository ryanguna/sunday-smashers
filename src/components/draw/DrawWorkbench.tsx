'use client'

import { useMemo, useState, useTransition } from 'react'

import { Button, Card, Confetti, EmptyState, useToast } from '@/components/ui'
import {
  BaubleIcon,
  GiftIcon,
  MedalIcon,
  RacketIcon,
  ShuttlecockIcon,
  SnowflakeIcon,
  SparkleIcon,
  TrophyIcon,
} from '@/components/icons'
import {
  buildDrawPreview,
  drawSummary,
  eligibleTeams,
  entryWarnings,
  ineligibleTeams,
  publishSafety,
  reorder,
  seedOrder,
  shuffleOrder,
  spreadSeeds,
  summarySentence,
  type DrawPreview,
} from '@/lib/draw-admin'
import type { DrawDivisionData } from '@/app/admin/draw/data'
import { publishRoundRobinAction } from '@/app/admin/draw/actions'
import { DivisionSwitcher } from './DivisionSwitcher'
import { DrawAlert, DrawStat, PanelHeading, WarningRail } from './DrawUI'
import { FixturePreview } from './FixturePreview'
import { IneligibleList, SeedingList } from './SeedingList'
import { PublishDrawModal, type PublishConfirmation } from './PublishDrawModal'

/**
 * `/admin/draw` — the round robin workbench.
 *
 * Nothing here touches the database until Publish: the preview is built
 * entirely in the browser by `generateRoundRobin()` (via `buildDrawPreview`)
 * so an admin can reshuffle as often as they like, compare alternatives and
 * only then commit.
 */
export function DrawWorkbench({
  divisions,
  isDemo,
}: {
  divisions: DrawDivisionData[]
  isDemo: boolean
}) {
  const [activeId, setActiveId] = useState(divisions[0]?.id ?? '')
  const [orders, setOrders] = useState<Record<string, string[]>>(() => initialOrders(divisions))
  const [seeds, setSeeds] = useState<Record<string, number | null>>({})
  const [previews, setPreviews] = useState<Record<string, DrawPreview | null>>({})
  const [modalOpen, setModalOpen] = useState(false)
  const [celebrating, setCelebrating] = useState(false)
  const [pending, startTransition] = useTransition()
  const { toast } = useToast()

  const division = divisions.find((item) => item.id === activeId) ?? divisions[0]

  const teamMap = useMemo(
    () => new Map((division?.teams ?? []).map((team) => [team.id, team] as const)),
    [division]
  )
  const eligible = useMemo(() => eligibleTeams(division?.teams ?? []), [division])
  const held = useMemo(() => ineligibleTeams(division?.teams ?? []), [division])
  const warnings = useMemo(
    () =>
      entryWarnings(division?.teams ?? [], {
        pendingRegistrations: division?.pendingRegistrations,
        unpairedPlayers: division?.unpairedPlayers,
      }),
    [division]
  )

  if (!division) {
    return (
      <EmptyState
        icon={<SnowflakeIcon size={30} />}
        title="No divisions to draw yet"
        description="Create a division in Settings and approve some entries, then come back to make the draw."
      />
    )
  }

  const order = orders[division.id] ?? []
  const preview = previews[division.id] ?? null
  const summary = drawSummary(order.length)
  const safety = publishSafety(division.publishedElims)

  function setOrder(next: string[], seed: number | null) {
    setOrders((current) => ({ ...current, [division.id]: next }))
    setSeeds((current) => ({ ...current, [division.id]: seed }))
    setPreviews((current) => ({ ...current, [division.id]: null }))
  }

  function generate() {
    setPreviews((current) => ({
      ...current,
      [division.id]: buildDrawPreview(order, seeds[division.id] ?? null),
    }))
    toast({
      title: 'Draw previewed 🎄',
      description: summarySentence(drawSummary(order.length)),
      variant: 'festive',
    })
  }

  function reshuffle() {
    const seed = Math.floor(Math.random() * 900000) + 100000
    const next = shuffleOrder(order, seed)
    setOrders((current) => ({ ...current, [division.id]: next }))
    setSeeds((current) => ({ ...current, [division.id]: seed }))
    setPreviews((current) => ({ ...current, [division.id]: buildDrawPreview(next, seed) }))
  }

  function applySpread() {
    const next = spreadSeeds(seedOrder(eligible).map((team) => team.id))
    setOrder(next, null)
  }

  function resetOrder() {
    setOrder(
      seedOrder(eligible).map((team) => team.id),
      null
    )
  }

  function publish(confirmation: PublishConfirmation) {
    startTransition(async () => {
      const result = await publishRoundRobinAction({
        divisionId: division.id,
        orderedTeamIds: order,
        rules: division.elimsRules,
        seed: seeds[division.id] ?? null,
        ...confirmation,
      })

      if (result.ok) {
        setModalOpen(false)
        setCelebrating(true)
        setTimeout(() => setCelebrating(false), 4000)
        toast({ title: 'Draw published!', description: result.message, variant: 'festive' })
        return
      }

      toast({
        title: result.demo ? 'Demo mode' : 'Not published',
        description: result.message,
        variant: result.demo ? 'warning' : 'danger',
        duration: 7000,
      })
      if (result.demo) {
        setModalOpen(false)
        setCelebrating(true)
        setTimeout(() => setCelebrating(false), 4000)
      }
    })
  }

  return (
    <div>
      <Confetti active={celebrating} count={64} />

      <DivisionSwitcher
        options={divisions.map((item) => ({
          id: item.id,
          name: item.name,
          hint: divisionHint(item),
        }))}
        activeId={division.id}
        onChange={setActiveId}
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <DrawStat
          label="Eligible pairs"
          value={eligible.length}
          hint={`${division.teams.length} entered`}
          icon={<ShuttlecockIcon size={18} />}
          tone="pink"
        />
        <DrawStat
          label="Games in the draw"
          value={summary.totalGames}
          hint={`${summary.gamesEach} each`}
          icon={<RacketIcon size={18} />}
          tone="lilac"
        />
        <DrawStat
          label="Rounds"
          value={summary.rounds}
          hint={`${summary.concurrentPerRound} concurrent per round`}
          icon={<SnowflakeIcon size={18} />}
          tone="sky"
        />
        <DrawStat
          label="First to"
          value={`${division.elimsRules.pointsToWin} pts`}
          hint={division.elimsRules.deuce ? 'Deuce enabled' : 'No deuce'}
          icon={<BaubleIcon size={18} />}
          tone="mint"
        />
      </div>

      <div className="mb-4">
        <WarningRail warnings={warnings} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <Card variant="candy-stripe" className="h-fit">
          <PanelHeading
            icon={<MedalIcon size={18} className="text-[var(--color-brand-gold-dark)]" />}
            title="Seeding & draw order"
            description="Drag a pair, or nudge with ▲▼. Position decides when the big hitters meet, not whether."
          />

          <SeedingList
            teams={teamMap}
            order={order}
            onReorder={(from, to) =>
              setOrder(reorder(order, from, to), seeds[division.id] ?? null)
            }
          />

          <IneligibleList entries={held} />

          <div className="mt-4 flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={applySpread}>
              <SparkleIcon size={16} aria-hidden="true" />
              Spread the seeds
            </Button>
            <Button size="sm" variant="ghost" onClick={resetOrder}>
              Reset to seed order
            </Button>
          </div>
        </Card>

        <div className="flex flex-col gap-4">
          <Card variant="frosted">
            <PanelHeading
              icon={<GiftIcon size={18} className="text-[var(--color-brand-holly)]" />}
              title="Generate the draw"
              description={summarySentence(summary)}
              actions={
                <>
                  <Button size="sm" onClick={generate} disabled={order.length < 2}>
                    <ShuttlecockIcon size={16} aria-hidden="true" />
                    {preview ? 'Regenerate preview' : 'Generate preview'}
                  </Button>
                  <Button size="sm" variant="secondary" onClick={reshuffle} disabled={order.length < 2}>
                    <SnowflakeIcon size={16} aria-hidden="true" />
                    Reshuffle
                  </Button>
                </>
              }
            />

            {seeds[division.id] != null && (
              <p className="mb-2 text-xs text-[var(--color-ink-muted)]">
                Shuffle seed{' '}
                <span className="font-bold tabular-nums text-[var(--color-plum)]">
                  {seeds[division.id]}
                </span>{' '}
                — the same seed always produces this exact order.
              </p>
            )}

            {safety.existingCount > 0 && (
              <DrawAlert
                level={safety.level}
                title={safety.headline}
                detail={safety.detail}
                className="mb-3"
              />
            )}

            {preview ? (
              <>
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <Button
                    variant={safety.destructive ? 'danger' : 'festive'}
                    onClick={() => setModalOpen(true)}
                    disabled={eligible.length < 2}
                  >
                    <TrophyIcon size={18} aria-hidden="true" />
                    Publish {preview.fixtures.length} fixtures
                  </Button>
                  <Button variant="ghost" size="sm" href="/admin/draw/knockout">
                    Standings & knockout →
                  </Button>
                </div>
                <FixturePreview preview={preview} teams={teamMap} />
              </>
            ) : (
              <EmptyState
                icon={<ShuttlecockIcon size={30} />}
                title="No preview yet"
                description="Hit Generate preview to see every fixture, round by round. Nothing is saved until you publish."
                action={
                  <Button onClick={generate} disabled={order.length < 2}>
                    <SparkleIcon size={18} aria-hidden="true" />
                    Generate preview
                  </Button>
                }
              />
            )}
          </Card>
        </div>
      </div>

      <PublishDrawModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onConfirm={publish}
        existing={division.publishedElims}
        kind="round-robin"
        fixtureCount={preview?.fixtures.length ?? 0}
        divisionName={division.name}
        busy={pending}
      />

      {isDemo && (
        <p className="mt-4 text-center text-xs text-[var(--color-ink-muted)]">
          Demo mode — publishing is previewed (confetti and all) but never written.
        </p>
      )}
    </div>
  )
}

function initialOrders(divisions: DrawDivisionData[]): Record<string, string[]> {
  const orders: Record<string, string[]> = {}
  for (const division of divisions) {
    orders[division.id] = seedOrder(eligibleTeams(division.teams)).map((team) => team.id)
  }
  return orders
}

function divisionHint(division: DrawDivisionData): string {
  const eligible = eligibleTeams(division.teams).length
  const published = division.publishedElims.length
  const results = division.publishedElims.filter((match) => match.hasResult).length
  if (published === 0) return `${eligible} pairs · not drawn yet`
  if (results > 0) return `${published} fixtures · ${results} played`
  return `${published} fixtures · published`
}
