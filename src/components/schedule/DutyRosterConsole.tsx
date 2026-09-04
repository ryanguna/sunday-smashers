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
  SnowflakeIcon,
  SparkleIcon,
  TrophyIcon,
} from '@/components/icons'
import {
  DUTY_SEATS,
  DUTY_SOURCE_LABELS,
  buildDutyRoster,
  canAssignOfficial,
  dutiesByPlayer,
  dutyRosterInserts,
  eligibleOfficials,
  matchLabel,
  matchesNeedingVolunteers,
  matchesWithEmptySeats,
  playerNameMap,
  printableCourtSheets,
  sortMatches,
  teamNameMap,
  type DutyMatchView,
  type DutyOverride,
  type PlacementMap,
  type SchedulableMatch,
  type ScheduleCourt,
  type ScheduleSlot,
  type ScheduleTeam,
} from '@/lib/schedule-admin'
import { saveDutyRosterAction } from '@/app/admin/schedule/actions'
import { ConflictRail } from './ConflictRail'
import { StagePill } from './MatchChip'

/**
 * The duty roster console.
 *
 * Officials are derived by the engine straight from the rule in the draft
 * sheet — the players of the *next* match on that court officiate the
 * current one — and every manual edit is re-checked against the same
 * invariant before it is allowed anywhere near the database.
 */

export interface DutyRosterConsoleProps {
  matches: SchedulableMatch[]
  courts: ScheduleCourt[]
  slots: ScheduleSlot[]
  teams: ScheduleTeam[]
  savedPlacements: PlacementMap
  manualDuties: DutyOverride[]
  isDemo: boolean
}

export function DutyRosterConsole({
  matches,
  courts,
  slots,
  teams,
  savedPlacements,
  manualDuties,
  isDemo,
}: DutyRosterConsoleProps) {
  const { toast } = useToast()
  const [overrides, setOverrides] = useState<DutyOverride[]>(manualDuties)
  const [editingMatchId, setEditingMatchId] = useState<string | null>(null)
  const [courtFilter, setCourtFilter] = useState('all')
  const [blocked, setBlocked] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const ordered = useMemo(() => sortMatches(matches), [matches])
  const teamNames = useMemo(() => teamNameMap(teams), [teams])
  const allNames = useMemo(() => ({ ...teamNameMap(teams), ...playerNameMap(teams) }), [teams])
  const slotLabels = useMemo(() => {
    const map: Record<number, string> = {}
    for (const slot of slots) map[slot.index] = slot.label
    return map
  }, [slots])
  const placements = savedPlacements

  const view = useMemo(
    () => buildDutyRoster({ matches: ordered, placements, courts, slots, teams, overrides }),
    [ordered, placements, courts, slots, teams, overrides],
  )

  const volunteers = useMemo(() => matchesNeedingVolunteers(view), [view])
  const partial = useMemo(() => matchesWithEmptySeats(view), [view])
  const players = useMemo(() => dutiesByPlayer(view), [view])
  const sheets = useMemo(() => printableCourtSheets(view), [view])
  const rows = useMemo(() => dutyRosterInserts(view), [view])

  const dutyConflicts = useMemo(
    () =>
      view.conflicts.map((conflict, index) => ({
        id: `${conflict.type}-${index}`,
        type: conflict.type,
        tone: (conflict.severity === 'error' ? 'danger' : 'warn') as 'danger' | 'warn',
        title: 'Roster problem',
        detail: conflict.message,
        matchIds: conflict.matchIds ?? [],
      })),
    [view],
  )

  const visibleSheets = courtFilter === 'all' ? sheets : sheets.filter((s) => s.courtId === courtFilter)

  function applyOverride(matchId: string, role: DutyOverride['role'], index: number, playerId: string) {
    const verdict = canAssignOfficial({
      matchId,
      playerId,
      matches: ordered,
      placements,
      courts,
      slots,
      teams,
      // The roster as it currently stands, so seating someone who is already
      // officiating another court in this slot is refused here rather than
      // only by the server action on save.
      duties: rows.map((r) => ({ matchId: r.match_id, playerId: r.player_id })),
    })
    if (!verdict.allowed) {
      setBlocked(verdict.reason)
      toast({ title: 'Nope — that one is not allowed', description: verdict.reason, variant: 'danger' })
      return
    }
    setBlocked(null)
    setOverrides((current) => [
      ...current.filter((o) => !(o.matchId === matchId && o.role === role && o.index === index)),
      { matchId, role, index, playerId },
    ])
  }

  function handleReset() {
    setOverrides([])
    setBlocked(null)
    toast({ title: 'Back to the derived roster.', description: 'Next match up officiates, as written in the rules.' })
  }

  function handleSave() {
    startTransition(async () => {
      const result = await saveDutyRosterAction({
        matchIds: view.matches.map((m) => m.match.id),
        rows,
      })
      toast({
        title: result.ok ? 'Duty roster saved! 🔔' : 'Not saved',
        description: result.message,
        variant: result.ok ? 'festive' : result.demo ? 'warning' : 'danger',
      })
    })
  }

  if (view.matches.length === 0) {
    return (
      <Card variant="frosted">
        <CardBody className="text-center">
          <SnowflakeIcon
            size={32}
            aria-hidden="true"
            className="mx-auto mb-2 text-[var(--color-brand-lilac-dark)]"
          />
          <p className="font-[family-name:var(--font-heading)] text-lg font-extrabold" style={{ color: 'var(--color-plum)' }}>
            No matches on a court yet
          </p>
          <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
            Build the schedule first — duties follow the running order on each court.
          </p>
          <div className="mt-3">
            <Button href="/admin/schedule" variant="festive" size="sm">
              Go to the schedule builder
            </Button>
          </div>
        </CardBody>
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 min-[380px]:grid-cols-2 gap-3 lg:grid-cols-4 print:hidden">
        <StatCard
          label="Matches rostered"
          value={view.matches.length}
          hint={`${rows.length} duty seats filled`}
          tone="mint"
          icon={<RacketIcon size={20} aria-hidden="true" />}
        />
        <StatCard
          label="Needs volunteers"
          value={volunteers.length}
          hint="Nobody available — usually the last match on a court"
          tone={volunteers.length === 0 ? 'mint' : 'pink'}
          icon={<BaubleIcon size={20} aria-hidden="true" />}
        />
        <StatCard
          label="Empty seats"
          value={partial.length}
          hint="Matches short of a full four"
          tone="gold"
          icon={<HollyIcon size={20} aria-hidden="true" />}
        />
        <StatCard
          label="Officials on duty"
          value={players.length}
          hint="Players with at least one duty"
          tone="sky"
          icon={<TrophyIcon size={20} aria-hidden="true" />}
        />
      </div>

      <Card variant="frosted" className="print:hidden">
        <CardBody className="flex flex-wrap items-center gap-2.5">
          <Button variant="festive" size="sm" onClick={handleSave} disabled={pending}>
            <GiftIcon size={16} aria-hidden="true" />
            {pending ? 'Saving…' : 'Save duty roster'}
          </Button>
          <Button variant="secondary" size="sm" onClick={handleReset} disabled={overrides.length === 0}>
            Reset to derived
          </Button>
          <Button variant="ghost" size="sm" onClick={() => window.print()}>
            Print court sheets
          </Button>
          <label className="ml-auto flex items-center gap-2 text-xs font-bold uppercase tracking-[0.08em] text-[var(--color-ink-muted)]">
            Court
            <select
              value={courtFilter}
              onChange={(event) => setCourtFilter(event.target.value)}
              className="rounded-[var(--radius-pill)] border border-[var(--color-brand-lilac-light)] bg-white px-3 py-1.5 text-sm font-semibold normal-case tracking-normal text-[var(--color-plum)]"
            >
              <option value="all">All courts</option>
              {sheets.map((sheet) => (
                <option key={sheet.courtId} value={sheet.courtId}>
                  {sheet.courtName}
                </option>
              ))}
            </select>
          </label>
        </CardBody>
      </Card>

      {isDemo && (
        <p className="rounded-[var(--radius-md)] bg-[var(--color-info-bg)] p-3 text-sm font-semibold text-[var(--color-info)] print:hidden">
          Demo mode — reassign away, nothing is written to a database. 🎅
        </p>
      )}

      {blocked && (
        <p
          role="alert"
          className="rounded-[var(--radius-md)] bg-[var(--color-danger-bg)] p-3 text-sm font-semibold text-[var(--color-danger)] print:hidden"
        >
          {blocked}
        </p>
      )}

      <div className="print:hidden">
        <Tabs
          items={[
            {
              id: 'sheets',
              label: 'Court sheets',
              content: (
                <div className="flex flex-col gap-4">
                  {visibleSheets.map((sheet) => (
                    <section key={sheet.courtId} aria-labelledby={`court-${sheet.courtId}`}>
                      <h2
                        id={`court-${sheet.courtId}`}
                        className="mb-2 font-[family-name:var(--font-heading)] text-xl font-extrabold"
                        style={{ color: 'var(--color-plum)' }}
                      >
                        {sheet.courtName}
                      </h2>
                      <ul className="flex flex-col gap-2">
                        {sheet.matches.map((match) => (
                          <DutyMatchCard
                            key={match.match.id}
                            entry={match}
                            teamNames={teamNames}
                            editing={editingMatchId === match.match.id}
                            onToggleEdit={() =>
                              setEditingMatchId((current) =>
                                current === match.match.id ? null : match.match.id,
                              )
                            }
                            options={
                              editingMatchId === match.match.id
                                ? eligibleOfficials({
                                    matchId: match.match.id,
                                    matches: ordered,
                                    placements,
                                    courts,
                                    slots,
                                    teams,
                                  })
                                : []
                            }
                            onAssign={applyOverride}
                          />
                        ))}
                      </ul>
                    </section>
                  ))}
                </div>
              ),
            },
            {
              id: 'volunteers',
              label: `Needs volunteers (${volunteers.length})`,
              content:
                volunteers.length === 0 ? (
                  <p className="rounded-[var(--radius-md)] bg-[var(--color-success-bg)] p-4 text-sm font-semibold text-[var(--color-success)]">
                    Every match has officials. Merry and bright. ✨
                  </p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {volunteers.map((entry) => (
                      <li
                        key={entry.match.id}
                        className="rounded-[var(--radius-md)] bg-[var(--color-warn-bg)] p-3 text-sm text-[var(--color-warn)]"
                      >
                        <p className="font-bold">
                          {entry.courtName} · {entry.slotLabel}
                        </p>
                        <p>{matchLabel(entry.match, teamNames)}</p>
                        <p className="mt-1">
                          Nobody is playing next on this court — grab a committee member or a
                          volunteer for this one.
                        </p>
                      </li>
                    ))}
                  </ul>
                ),
            },
            {
              id: 'players',
              label: 'Your duties',
              content: <PlayerDutyList players={players} />,
            },
            {
              id: 'problems',
              label: `Roster checks (${dutyConflicts.length})`,
              content: (
                <ConflictRail
                  conflicts={dutyConflicts}
                  names={allNames}
                  slotLabels={slotLabels}
                  emptyMessage="No roster problems. Nobody is umpiring their own match. 🎄"
                />
              ),
            },
          ]}
        />
      </div>

      <PrintableSheets sheets={sheets} teamNames={teamNames} />
    </div>
  )
}

function DutyMatchCard({
  entry,
  teamNames,
  editing,
  options,
  onToggleEdit,
  onAssign,
}: {
  entry: DutyMatchView
  teamNames: Record<string, string>
  editing: boolean
  options: ReturnType<typeof eligibleOfficials>
  onToggleEdit: () => void
  onAssign: (matchId: string, role: DutyOverride['role'], index: number, playerId: string) => void
}) {
  return (
    <li
      className={cn(
        'rounded-[var(--radius-md)] bg-white p-3 shadow-[var(--shadow-soft)]',
        entry.needsVolunteers && 'ring-2 ring-[var(--color-warn)]',
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <StagePill match={entry.match} />
        <span className="text-[0.68rem] font-bold uppercase tracking-[0.1em] text-[var(--color-ink-muted)]">
          {entry.slotLabel}
        </span>
        <Badge status={entry.filledCount === 4 ? 'approved' : 'pending'}>
          {entry.filledCount}/4 seats
        </Badge>
        <button
          type="button"
          onClick={onToggleEdit}
          aria-expanded={editing}
          className="ml-auto rounded-[var(--radius-pill)] bg-[var(--color-brand-lilac-light)] px-3 py-1 text-xs font-bold text-[var(--color-brand-lilac-dark)]"
        >
          {editing ? 'Done' : 'Reassign'}
        </button>
      </div>

      <p className="mt-1.5 text-sm font-bold text-[var(--color-plum)]">
        {matchLabel(entry.match, teamNames)}
      </p>

      <ul className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {entry.slots.map((slot) => (
          <li
            key={`${slot.role}-${slot.index}`}
            className="rounded-[var(--radius-md)] bg-[var(--color-frost-100)] p-2.5"
          >
            <p className="text-[0.65rem] font-bold uppercase tracking-[0.1em] text-[var(--color-ink-muted)]">
              {slot.label}
            </p>
            {editing ? (
              <select
                value={slot.playerId}
                onChange={(event) =>
                  onAssign(entry.match.id, slot.role, slot.index, event.target.value)
                }
                aria-label={`${slot.label} for ${matchLabel(entry.match, teamNames)}`}
                className="mt-1 w-full rounded-[var(--radius-pill)] border border-[var(--color-brand-lilac-light)] bg-white px-2.5 py-1.5 text-sm font-semibold text-[var(--color-plum)]"
              >
                <option value="">— needs a volunteer —</option>
                {options.map((option) => (
                  <option
                    key={option.playerId}
                    value={option.playerId}
                    disabled={option.disabled}
                    title={option.reason}
                  >
                    {option.nextUp ? '⭐ ' : ''}
                    {option.playerName} ({option.teamName}){option.disabled ? ' — unavailable' : ''}
                  </option>
                ))}
              </select>
            ) : (
              <p className="mt-0.5 text-sm font-semibold text-[var(--color-plum)]">
                {slot.playerName || 'Needs a volunteer'}
              </p>
            )}
            <p className="mt-0.5 text-[0.68rem] text-[var(--color-ink-muted)]">
              {DUTY_SOURCE_LABELS[slot.source]}
            </p>
          </li>
        ))}
      </ul>

      {editing && (
        <p className="mt-2 rounded-[var(--radius-md)] bg-[var(--color-info-bg)] p-2.5 text-[0.72rem] text-[var(--color-info)]">
          ⭐ marks the players of the next match on this court — the rule says they officiate.
          Anyone playing in this match, or on court elsewhere at the same time, is greyed out.
        </p>
      )}
    </li>
  )
}

function PlayerDutyList({ players }: { players: ReturnType<typeof dutiesByPlayer> }) {
  if (players.length === 0) {
    return (
      <p className="rounded-[var(--radius-md)] bg-white/70 p-4 text-center text-sm font-semibold text-[var(--color-ink-muted)]">
        No duties assigned yet.
      </p>
    )
  }
  return (
    <ul className="grid gap-2 sm:grid-cols-2">
      {players.map((player) => (
        <li key={player.playerId} className="rounded-[var(--radius-md)] bg-white p-3 shadow-[var(--shadow-soft)]">
          <p className="flex items-center gap-1.5 font-[family-name:var(--font-heading)] text-base font-extrabold" style={{ color: 'var(--color-plum)' }}>
            <SparkleIcon size={14} aria-hidden="true" className="text-[var(--color-brand-gold-dark)]" />
            {player.playerName}
          </p>
          <ul className="mt-1 flex flex-col gap-1">
            {player.duties.map((duty) => (
              <li key={`${duty.matchId}-${duty.role}-${duty.slotIndex}`} className="text-[0.78rem] text-[var(--color-ink-soft)]">
                <span className="font-semibold text-[var(--color-ink)]">{duty.slotLabel}</span> ·{' '}
                {duty.courtName} · {duty.roleLabel}
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  )
}

/**
 * Hidden on screen, the only thing that prints: one running order per court,
 * ready to tape to the net post.
 */
function PrintableSheets({
  sheets,
  teamNames,
}: {
  sheets: ReturnType<typeof printableCourtSheets>
  teamNames: Record<string, string>
}) {
  return (
    <div className="hidden print:block">
      {sheets.map((sheet) => (
        <section key={sheet.courtId} className="break-after-page">
          <h2 className="text-2xl font-extrabold" style={{ color: '#000' }}>
            {sheet.courtName} — duty roster
          </h2>
          <table className="mt-2 w-full border-collapse text-xs">
            <thead>
              <tr>
                <th className="border border-black p-1 text-left">Time</th>
                <th className="border border-black p-1 text-left">Match</th>
                {DUTY_SEATS.map((seat) => (
                  <th key={`${seat.role}-${seat.index}`} className="border border-black p-1 text-left">
                    {seat.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sheet.matches.map((entry) => (
                <tr key={entry.match.id}>
                  <td className="border border-black p-1">{entry.slotLabel}</td>
                  <td className="border border-black p-1">{matchLabel(entry.match, teamNames)}</td>
                  {DUTY_SEATS.map((seat) => {
                    const slot = entry.slots.find(
                      (s) => s.role === seat.role && s.index === seat.index,
                    )
                    return (
                      <td key={`${seat.role}-${seat.index}`} className="border border-black p-1">
                        {slot?.playerName || '____________'}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  )
}
