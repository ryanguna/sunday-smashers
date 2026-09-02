'use client'

import { useMemo, useState, useTransition } from 'react'
import { cn } from '@/lib/cn'
import { Badge, Button, Card, CardBody, Tabs, useToast } from '@/components/ui'
import { StatCard } from '@/components/admin/AdminUI'
import {
  BaubleIcon,
  GiftIcon,
  HollyIcon,
  RacketIcon,
  ShuttlecockIcon,
  SnowflakeIcon,
  SparkleIcon,
} from '@/components/icons'
import {
  analyseSchedule,
  autoSchedule,
  buildTimeline,
  matchLabel,
  placeMatch,
  playerNameMap,
  restGaps,
  scheduleStats,
  schedulePatches,
  schedulePublishSafety,
  sortMatches,
  swapMatches,
  teamNameMap,
  unplacedMatches,
  type PlacementMap,
  type SchedulableMatch,
  type ScheduleCourt,
  type ScheduleSlot,
  type ScheduleTeam,
} from '@/lib/schedule-admin'
import { publishScheduleAction } from '@/app/admin/schedule/actions'
import { ConflictRail } from './ConflictRail'
import { PublishScheduleModal } from './PublishScheduleModal'
import { ScheduleGrid } from './ScheduleGrid'
import { ScheduleListView } from './ScheduleListView'
import { StagePill } from './MatchChip'

/**
 * The schedule workbench.
 *
 * Everything here is derived from `src/lib/schedule-admin.ts`, which in turn
 * sits on the read-only engine in `src/lib/schedule.ts` — this file only owns
 * the two bits of state an admin actually edits (where each match sits, and
 * which match is currently picked up).
 */

export interface ScheduleBuilderProps {
  matches: SchedulableMatch[]
  courts: ScheduleCourt[]
  slots: ScheduleSlot[]
  teams: ScheduleTeam[]
  savedPlacements: PlacementMap
  isDemo: boolean
}

export function ScheduleBuilder({
  matches,
  courts,
  slots,
  teams,
  savedPlacements,
  isDemo,
}: ScheduleBuilderProps) {
  const { toast } = useToast()
  const [placements, setPlacements] = useState<PlacementMap>(savedPlacements)
  const [pickedUp, setPickedUp] = useState<string | null>(null)
  const [partials, setPartials] = useState<
    Record<string, { courtId: string | null; slotId: string | null }>
  >({})
  const [announcement, setAnnouncement] = useState('')
  const [divisionFilter, setDivisionFilter] = useState<string>('all')
  const [publishOpen, setPublishOpen] = useState(false)
  const [overrideConflicts, setOverrideConflicts] = useState(false)
  const [confirmMoveResults, setConfirmMoveResults] = useState(false)
  const [pending, startTransition] = useTransition()

  const teamNames = useMemo(() => teamNameMap(teams), [teams])
  const allNames = useMemo(() => ({ ...teamNameMap(teams), ...playerNameMap(teams) }), [teams])
  const slotLabels = useMemo(() => {
    const map: Record<number, string> = {}
    for (const slot of slots) map[slot.index] = slot.label
    return map
  }, [slots])
  const ordered = useMemo(() => sortMatches(matches), [matches])
  const divisions = useMemo(() => {
    const seen = new Map<string, string>()
    for (const match of ordered) seen.set(match.divisionId, match.divisionName)
    return [...seen].map(([id, name]) => ({ id, name }))
  }, [ordered])

  const analysis = useMemo(
    () => analyseSchedule({ matches: ordered, placements, courts, slots, teams }),
    [ordered, placements, courts, slots, teams],
  )
  const stats = useMemo(
    () => scheduleStats(ordered, placements, courts, slots),
    [ordered, placements, courts, slots],
  )
  const timeline = useMemo(
    () => buildTimeline(ordered, placements, courts, slots),
    [ordered, placements, courts, slots],
  )
  const gaps = useMemo(
    () => restGaps(ordered, placements, slots, teams).filter((row) => row.tight).slice(0, 8),
    [ordered, placements, slots, teams],
  )
  const bench = useMemo(() => unplacedMatches(ordered, placements), [ordered, placements])

  const safety = useMemo(
    () =>
      schedulePublishSafety(ordered, placements, analysis, {
        overrideConflicts,
        confirmMoveResults,
      }),
    [ordered, placements, analysis, overrideConflicts, confirmMoveResults],
  )

  const dimmed = useMemo(
    () =>
      divisionFilter === 'all'
        ? []
        : ordered.filter((m) => m.divisionId !== divisionFilter).map((m) => m.id),
    [ordered, divisionFilter],
  )

  const matchById = useMemo(() => new Map(ordered.map((m) => [m.id, m])), [ordered])
  const playedIds = useMemo(() => ordered.filter((m) => m.hasResult).map((m) => m.id), [ordered])

  function handleCellActivate(
    courtId: string,
    slotId: string,
    match: SchedulableMatch | null,
  ) {
    if (!pickedUp) {
      if (!match) {
        setAnnouncement('That cell is empty. Choose a match first, then choose where it goes.')
        return
      }
      setPickedUp(match.id)
      setAnnouncement(`Picked up ${matchLabel(match, teamNames)}. Now choose a cell.`)
      return
    }

    if (match && match.id === pickedUp) {
      setPickedUp(null)
      setAnnouncement('Put back down.')
      return
    }

    setPlacements((current) =>
      match
        ? swapMatches(current, pickedUp, match.id)
        : placeMatch(current, pickedUp, { courtId, slotId }),
    )
    const moved = matchById.get(pickedUp)
    setAnnouncement(
      `${moved ? matchLabel(moved, teamNames) : 'Match'} moved${match ? ', swapped with the match that was there' : ''}.`,
    )
    setPickedUp(null)
  }

  // The list view lets an admin pick a court and a slot independently, so a
  // half-made choice is remembered until the pair is complete.
  function handlePlace(matchId: string, courtId: string | null, slotId: string | null) {
    setPartials((current) => ({ ...current, [matchId]: { courtId, slotId } }))
    setPlacements((current) =>
      placeMatch(current, matchId, courtId && slotId ? { courtId, slotId } : null),
    )
  }

  function handleAutoSchedule() {
    const result = autoSchedule(ordered, courts, slots, placements, {
      lockedMatchIds: playedIds,
    })
    setPlacements(result.placements)
    setPickedUp(null)
    toast({
      variant: result.unscheduled.length > 0 ? 'warning' : 'festive',
      title:
        result.unscheduled.length > 0
          ? `${result.unscheduled.length} match${result.unscheduled.length === 1 ? '' : 'es'} would not fit`
          : 'Schedule laid out! 🎄',
      description:
        result.unscheduled.length > 0
          ? 'Add more time slots or courts, then run it again.'
          : 'Rounds are spread across the courts. Have a look before you publish.',
    })
  }

  function handleReset() {
    setPlacements(savedPlacements)
    setPartials({})
    setPickedUp(null)
    setOverrideConflicts(false)
    setConfirmMoveResults(false)
    toast({ title: 'Back to the saved schedule.', variant: 'default' })
  }

  function handlePublish() {
    const patches = schedulePatches(ordered, placements)
    startTransition(async () => {
      const result = await publishScheduleAction({
        patches,
        overrideConflicts,
        confirmMoveResults,
        conflictSummary: analysis.conflicts
          .filter((c) => c.tone === 'danger')
          .map((c) => c.title)
          .slice(0, 10),
      })
      toast({
        title: result.ok ? 'Schedule published! 🔔' : 'Not published',
        description: result.message,
        variant: result.ok ? 'festive' : result.demo ? 'warning' : 'danger',
      })
      if (result.ok) {
        setPublishOpen(false)
        setOverrideConflicts(false)
        setConfirmMoveResults(false)
      }
    })
  }

  const visibleMatches =
    divisionFilter === 'all' ? ordered : ordered.filter((m) => m.divisionId === divisionFilter)

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 min-[380px]:grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Matches placed"
          value={`${stats.placed}/${stats.total}`}
          hint={stats.unplaced === 0 ? 'Every fixture has a home' : `${stats.unplaced} still homeless`}
          tone="mint"
          icon={<ShuttlecockIcon size={20} aria-hidden="true" />}
        />
        <StatCard
          label="Courts"
          value={stats.courts}
          hint={`${stats.slotsUsed} time slot${stats.slotsUsed === 1 ? '' : 's'} in use`}
          tone="sky"
          icon={<RacketIcon size={20} aria-hidden="true" />}
        />
        <StatCard
          label="Hard conflicts"
          value={analysis.errorCount}
          hint={analysis.errorCount === 0 ? 'All clear' : 'Fix before publishing'}
          tone={analysis.errorCount === 0 ? 'mint' : 'pink'}
          icon={<BaubleIcon size={20} aria-hidden="true" />}
        />
        <StatCard
          label="Warnings"
          value={analysis.warningCount}
          hint="Tight turnarounds &amp; empty seats"
          tone="gold"
          icon={<HollyIcon size={20} aria-hidden="true" />}
        />
      </div>

      <Card variant="frosted">
        <CardBody className="flex flex-wrap items-center gap-2.5">
          <Button variant="festive" size="sm" onClick={handleAutoSchedule}>
            <SparkleIcon size={16} aria-hidden="true" />
            Auto-schedule
          </Button>
          <Button variant="secondary" size="sm" onClick={handleReset}>
            Reset to saved
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => setPublishOpen(true)}
            disabled={safety.movedCount === 0}
          >
            <GiftIcon size={16} aria-hidden="true" />
            Publish…
          </Button>

          <label className="ml-auto flex items-center gap-2 text-xs font-bold uppercase tracking-[0.08em] text-[var(--color-ink-muted)]">
            Division
            <select
              value={divisionFilter}
              onChange={(event) => setDivisionFilter(event.target.value)}
              className="rounded-[var(--radius-pill)] border border-[var(--color-brand-lilac-light)] bg-white px-3 py-1.5 text-sm font-semibold normal-case tracking-normal text-[var(--color-plum)]"
            >
              <option value="all">All divisions</option>
              {divisions.map((division) => (
                <option key={division.id} value={division.id}>
                  {division.name}
                </option>
              ))}
            </select>
          </label>
        </CardBody>
      </Card>

      <p
        className={cn(
          'rounded-[var(--radius-md)] px-3.5 py-2.5 text-sm font-semibold',
          pickedUp
            ? 'bg-[image:var(--gradient-candy)] text-white'
            : 'bg-[var(--color-info-bg)] text-[var(--color-info)]',
        )}
        role="status"
        aria-live="polite"
      >
        <SnowflakeIcon size={15} className="mr-1.5 inline align-[-2px]" aria-hidden="true" />
        {pickedUp
          ? `Holding “${matchLabel(matchById.get(pickedUp) ?? ordered[0], teamNames)}” — now choose a cell to drop it in.`
          : 'Choose a match in the grid to pick it up, then choose where it should go. Prefer dropdowns? Use the list view.'}
        <span className="sr-only">{announcement}</span>
      </p>

      {analysis.errorCount > 0 && (
        <p
          role="alert"
          className="rounded-[var(--radius-md)] bg-[var(--color-danger-bg)] p-3.5 text-sm font-bold text-[var(--color-danger)]"
        >
          <BaubleIcon size={16} className="mr-1.5 inline align-[-3px]" aria-hidden="true" />
          {analysis.errorCount} hard conflict{analysis.errorCount === 1 ? '' : 's'} on the board —
          see Clash watch below. Publishing needs an explicit override until they are sorted.
        </p>
      )}

      <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_21rem]">
        <Tabs
          items={[
            {
              id: 'grid',
              label: 'Timeline grid',
              content: (
                <div className="flex min-w-0 flex-col gap-3">
                  <ScheduleGrid
                    rows={timeline}
                    courts={courts}
                    teamNames={teamNames}
                    selectedMatchId={pickedUp}
                    errorMatchIds={analysis.matchIdsWithErrors}
                    dimmedMatchIds={dimmed}
                    onCellActivate={handleCellActivate}
                  />
                  <BenchRail
                    matches={bench}
                    teamNames={teamNames}
                    pickedUp={pickedUp}
                    onPick={(id) => {
                      setPickedUp((current) => (current === id ? null : id))
                      setAnnouncement('Picked up. Choose a cell in the grid.')
                    }}
                  />
                </div>
              ),
            },
            {
              id: 'list',
              label: 'List view',
              content: (
                <ScheduleListView
                  matches={visibleMatches}
                  placements={placements}
                  courts={courts}
                  slots={slots}
                  teamNames={teamNames}
                  errorMatchIds={analysis.matchIdsWithErrors}
                  partials={partials}
                  onPlace={handlePlace}
                />
              ),
            },
          ]}
        />

        <div className="flex min-w-0 flex-col gap-3">
          <section aria-labelledby="conflict-heading">
            <h2
              id="conflict-heading"
              className="mb-2 font-[family-name:var(--font-heading)] text-lg font-extrabold"
              style={{ color: 'var(--color-plum)' }}
            >
              Clash watch
            </h2>
            <ConflictRail
              conflicts={analysis.conflicts}
              names={allNames}
              slotLabels={slotLabels}
            />
          </section>

          <section aria-labelledby="rest-heading">
            <h2
              id="rest-heading"
              className="mb-2 font-[family-name:var(--font-heading)] text-lg font-extrabold"
              style={{ color: 'var(--color-plum)' }}
            >
              Tight turnarounds
            </h2>
            {gaps.length === 0 ? (
              <p className="rounded-[var(--radius-md)] bg-[var(--color-success-bg)] p-3 text-sm font-semibold text-[var(--color-success)]">
                Everybody gets a breather between matches. ☕
              </p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {gaps.map((row) => (
                  <li
                    key={row.teamId}
                    className="flex items-center justify-between gap-2 rounded-[var(--radius-md)] bg-white p-2.5 text-sm shadow-[var(--shadow-soft)]"
                  >
                    <span className="min-w-0 truncate font-semibold text-[var(--color-plum)]">
                      {row.teamName}
                    </span>
                    <Badge status={row.minGap === 0 ? 'unpaid' : 'pending'}>
                      {row.minGap === 0 ? 'back-to-back' : `${row.minGap} slot rest`}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      <PublishScheduleModal
        open={publishOpen}
        onClose={() => setPublishOpen(false)}
        safety={safety}
        analysis={analysis}
        overrideConflicts={overrideConflicts}
        confirmMoveResults={confirmMoveResults}
        onToggleOverride={setOverrideConflicts}
        onToggleMoveResults={setConfirmMoveResults}
        onConfirm={handlePublish}
        busy={pending}
        isDemo={isDemo}
      />
    </div>
  )
}

function BenchRail({
  matches,
  teamNames,
  pickedUp,
  onPick,
}: {
  matches: SchedulableMatch[]
  teamNames: Record<string, string>
  pickedUp: string | null
  onPick: (matchId: string) => void
}) {
  if (matches.length === 0) {
    return (
      <p className="rounded-[var(--radius-md)] bg-[var(--color-success-bg)] p-3 text-sm font-semibold text-[var(--color-success)]">
        Nothing waiting on the bench — every match is on a court. 🏸
      </p>
    )
  }

  return (
    <section aria-labelledby="bench-heading" className="rounded-[var(--radius-lg)] bg-frost-glass p-3">
      <h2
        id="bench-heading"
        className="mb-2 font-[family-name:var(--font-heading)] text-base font-extrabold"
        style={{ color: 'var(--color-plum)' }}
      >
        Waiting for a court ({matches.length})
      </h2>
      <ul className="flex flex-wrap gap-2">
        {matches.slice(0, 24).map((match) => (
          <li key={match.id}>
            <button
              type="button"
              onClick={() => onPick(match.id)}
              aria-pressed={pickedUp === match.id}
              className={cn(
                'rounded-[var(--radius-md)] px-2.5 py-1.5 text-left text-xs shadow-[var(--shadow-soft)]',
                pickedUp === match.id
                  ? 'bg-[image:var(--gradient-candy)] text-white'
                  : 'bg-white text-[var(--color-ink)] hover:bg-[var(--color-brand-mint-light)]/60',
              )}
            >
              <span className="mb-0.5 block">
                <StagePill match={match} />
              </span>
              <span className="block font-semibold">{matchLabel(match, teamNames)}</span>
            </button>
          </li>
        ))}
        {matches.length > 24 && (
          <li className="self-center text-xs font-semibold text-[var(--color-ink-muted)]">
            + {matches.length - 24} more — try Auto-schedule
          </li>
        )}
      </ul>
    </section>
  )
}
