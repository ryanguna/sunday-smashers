'use client'

import { useMemo, useState, useTransition } from 'react'

import {
  Badge,
  Button,
  Card,
  EmptyState,
  Modal,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
  useToast,
  type BadgeStatus,
} from '@/components/ui'
import { HollyIcon, MedalIcon, ShuttlecockIcon, SnowflakeIcon, TrophyIcon } from '@/components/icons'
import { StatCard } from '@/components/admin/AdminUI'
import { TeamsPairingBench } from '@/components/admin/TeamsPairingBench'
import {
  PAYMENT_STATUS_LABELS,
  REGISTRATION_STATUS_LABELS,
  capacityState,
  initials,
  type AdminDivision,
} from '@/lib/admin'
import { cn } from '@/lib/cn'
import {
  EMPTY_TEAM_FILTERS,
  MAX_TEAM_NAME_LENGTH,
  TEAM_SIZE,
  filterTeams,
  hasBlockingIssue,
  nextAvailableSeed,
  parseSeed,
  planPairing,
  summarisePairingPool,
  tallyIssues,
  teamDisplayName,
  validateTeams,
  type AdminTeam,
  type TeamFilters,
  type TeamPlayer,
} from '@/lib/teams-admin'

import {
  autoPairDivisionAction,
  createTeamAction,
  dissolveTeamAction,
  renameTeamAction,
  setTeamSeedAction,
  type TeamActionResult,
} from '@/app/admin/teams/actions'

/**
 * The teams bench.
 *
 * Two halves: the pairing queue (free agents waiting for a partner) and the
 * team roster (everyone already paired, with seeds and validation). Both read
 * from props — this component never touches Supabase directly, which is what
 * keeps `next/headers` out of the client bundle.
 */

const inputClasses =
  'rounded-[var(--radius-pill)] border border-[var(--color-brand-lilac-light)] bg-white px-3.5 py-2 text-sm font-semibold text-[var(--color-plum)] shadow-[var(--shadow-soft)] focus:outline-none'

function memberStatusBadge(player: TeamPlayer): BadgeStatus {
  if (player.status === 'approved') return 'approved'
  if (player.status === 'rejected') return 'forfeit'
  return 'pending'
}

function paymentBadge(status: TeamPlayer['paymentStatus']): BadgeStatus {
  if (status === 'paid') return 'paid'
  if (status === 'partial') return 'pending'
  return 'unpaid'
}

function MemberChip({ player }: { player: TeamPlayer }) {
  return (
    <span className="flex items-start gap-2">
      <span
        aria-hidden="true"
        className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[image:var(--gradient-frost)] text-[0.65rem] font-extrabold text-[var(--color-plum)]"
      >
        {initials(player.name)}
      </span>
      <span className="min-w-0">
        <span className="block font-bold text-[var(--color-plum)]">{player.name}</span>
        <span className="mt-0.5 flex flex-wrap gap-1">
          <Badge status={memberStatusBadge(player)}>
            {REGISTRATION_STATUS_LABELS[player.status]}
          </Badge>
          <Badge status={paymentBadge(player.paymentStatus)}>
            {PAYMENT_STATUS_LABELS[player.paymentStatus]}
          </Badge>
        </span>
      </span>
    </span>
  )
}

export function TeamsClient({
  divisions,
  teams,
  freeAgents,
  isDemo,
}: {
  divisions: AdminDivision[]
  teams: AdminTeam[]
  freeAgents: TeamPlayer[]
  isDemo: boolean
}) {
  const { toast } = useToast()
  const [pending, startTransition] = useTransition()

  const [filters, setFilters] = useState<TeamFilters>(EMPTY_TEAM_FILTERS)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [pairName, setPairName] = useState('')
  const [renaming, setRenaming] = useState<AdminTeam | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [dissolving, setDissolving] = useState<AdminTeam | null>(null)
  const [seedDrafts, setSeedDrafts] = useState<Record<string, string>>({})

  const issuesByTeam = useMemo(() => validateTeams(teams, divisions), [teams, divisions])
  const tally = useMemo(() => tallyIssues(issuesByTeam), [issuesByTeam])
  const visible = useMemo(
    () => filterTeams(teams, filters, issuesByTeam),
    [teams, filters, issuesByTeam]
  )
  const pools = useMemo(
    () => summarisePairingPool(freeAgents, teams, divisions),
    [freeAgents, teams, divisions]
  )

  const selected = selectedIds
    .map((id) => freeAgents.find((player) => player.playerId === id))
    .filter((player): player is TeamPlayer => player !== undefined)

  const pairPlan =
    selected.length === TEAM_SIZE ? planPairing(selected[0], selected[1], divisions) : null

  function report(result: TeamActionResult) {
    toast({
      title: result.ok ? 'Done' : result.demo ? 'Demo mode' : 'Not saved',
      description: result.message,
      variant: result.ok ? 'festive' : result.demo ? 'default' : 'danger',
    })
  }

  function run(action: () => Promise<TeamActionResult>, onSuccess?: () => void) {
    startTransition(() => {
      void action().then((result) => {
        report(result)
        if (result.ok) onSuccess?.()
      })
    })
  }

  function toggleSelection(playerId: string) {
    setSelectedIds((current) => {
      if (current.includes(playerId)) return current.filter((id) => id !== playerId)
      if (current.length >= TEAM_SIZE) return current
      return [...current, playerId]
    })
  }

  function commitSeed(team: AdminTeam, raw: string) {
    const parsed = parseSeed(raw)
    if (!parsed.ok) {
      toast({ title: 'Not saved', description: parsed.message, variant: 'danger' })
      return
    }
    if (parsed.value === team.seed) return
    run(() => setTeamSeedAction({ teamId: team.id, seed: parsed.value }))
  }

  const pairedPlayers = teams.reduce((total, team) => total + team.members.length, 0)

  return (
    <>
      <section aria-labelledby="teams-stats" className="mb-6">
        <h2 id="teams-stats" className="sr-only">
          Team totals
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Teams built"
            value={teams.length}
            hint={`${pairedPlayers.toString()} players paired up`}
            tone="pink"
            icon={<ShuttlecockIcon size={20} />}
          />
          <StatCard
            label="Free agents"
            value={freeAgents.length}
            hint={
              pools.some((pool) => pool.hasOddOneOut)
                ? 'Someone will be left without a partner'
                : 'All evenly matched'
            }
            tone="sky"
            icon={<SnowflakeIcon size={20} />}
          />
          <StatCard
            label="Teams seeded"
            value={teams.filter((team) => team.seed !== null).length}
            hint={`of ${teams.length.toString()} — seeds drive the draw`}
            tone="gold"
            icon={<MedalIcon size={20} />}
          />
          <StatCard
            label="Need attention"
            value={tally.teamsWithIssues}
            hint={`${tally.errors.toString()} blocking · ${tally.warnings.toString()} to chase`}
            tone={tally.errors > 0 ? 'pink' : 'mint'}
            icon={<HollyIcon size={20} />}
          />
        </div>
      </section>

      <section aria-labelledby="teams-bench" className="mb-6">
        <h2
          id="teams-bench"
          className="mb-1 flex items-center gap-2 text-lg font-extrabold text-[var(--color-plum)]"
        >
          <ShuttlecockIcon
            size={20}
            aria-hidden="true"
            className="shrink-0 text-[var(--color-brand-pink-dark)]"
          />
          Pairing bench
        </h2>
        <p className="mb-3 text-sm text-[var(--color-ink-soft)]">
          Pick two players from the same division to make a team. Nobody gets left on the bench on
          Christmas.
        </p>

        <TeamsPairingBench
          freeAgents={freeAgents}
          divisions={divisions}
          teams={teams}
          selectedIds={selectedIds}
          onToggle={toggleSelection}
          busy={pending}
          onAutoPair={(divisionId) => {
            run(() => autoPairDivisionAction({ divisionId }), () => {
              setSelectedIds([])
            })
          }}
        />

        {selected.length > 0 && (
          <Card variant="candy-stripe" className="mt-4 p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div className="min-w-0">
                <p className="font-[family-name:var(--font-script)] text-xl text-[var(--color-brand-pink-dark)]">
                  Partner up
                </p>
                <p className="font-[family-name:var(--font-heading)] text-lg font-extrabold text-[var(--color-plum)]">
                  {selected.map((player) => player.name).join(' & ')}
                  {selected.length === 1 && ' … and who else?'}
                </p>
                {pairPlan && !pairPlan.ok && (
                  <p className="mt-1 rounded-[var(--radius-md)] bg-[var(--color-danger-bg)] px-3 py-1.5 text-sm text-[var(--color-danger)]">
                    {pairPlan.message}
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                <div>
                  <label
                    htmlFor="pair-name"
                    className="mb-1 block text-xs font-bold uppercase tracking-wide text-[var(--color-ink-muted)]"
                  >
                    Team name (optional)
                  </label>
                  <input
                    id="pair-name"
                    value={pairName}
                    maxLength={MAX_TEAM_NAME_LENGTH}
                    onChange={(event) => {
                      setPairName(event.target.value)
                    }}
                    placeholder={pairPlan?.ok ? pairPlan.value.suggestedName : 'Jingle Bell Rockets'}
                    className={cn(inputClasses, 'w-full font-normal sm:w-64')}
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="festive"
                    disabled={pending || !pairPlan?.ok}
                    onClick={() => {
                      if (!pairPlan?.ok) return
                      run(
                        () =>
                          createTeamAction({
                            playerIds: [selected[0].playerId, selected[1].playerId],
                            name: pairName,
                          }),
                        () => {
                          setSelectedIds([])
                          setPairName('')
                        }
                      )
                    }}
                  >
                    Make it a team
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={pending}
                    onClick={() => {
                      setSelectedIds([])
                      setPairName('')
                    }}
                  >
                    Clear
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        )}
      </section>

      <section aria-labelledby="teams-roster">
        <h2
          id="teams-roster"
          className="mb-1 flex items-center gap-2 text-lg font-extrabold text-[var(--color-plum)]"
        >
          <TrophyIcon
            size={20}
            aria-hidden="true"
            className="shrink-0 text-[var(--color-brand-gold-dark)]"
          />
          Teams
        </h2>
        <p className="mb-3 text-sm text-[var(--color-ink-soft)]">
          Rename a team, set its seed, or send both players back to the bench.
        </p>

        <div className="mb-4 rounded-[var(--radius-lg)] bg-frost-glass p-3.5 shadow-[var(--shadow-soft)]">
          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label
                htmlFor="teams-search"
                className="mb-1 block text-xs font-bold uppercase tracking-wide text-[var(--color-ink-muted)]"
              >
                Search
              </label>
              <input
                id="teams-search"
                type="search"
                value={filters.search}
                onChange={(event) => {
                  setFilters({ ...filters, search: event.target.value })
                }}
                placeholder="Team name, player, seed…"
                className={cn(inputClasses, 'w-full font-normal')}
              />
            </div>
            <div className="sm:w-56">
              <label
                htmlFor="teams-division"
                className="mb-1 block text-xs font-bold uppercase tracking-wide text-[var(--color-ink-muted)]"
              >
                Division
              </label>
              <select
                id="teams-division"
                value={filters.divisionId}
                onChange={(event) => {
                  setFilters({ ...filters, divisionId: event.target.value })
                }}
                className={cn(inputClasses, 'w-full')}
              >
                <option value="all">All divisions</option>
                {divisions.map((division) => (
                  <option key={division.id} value={division.id}>
                    {division.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="mt-2.5 flex flex-wrap items-center gap-3">
            <p className="text-xs font-semibold text-[var(--color-ink-muted)]" aria-live="polite">
              Showing {visible.length} of {teams.length}
            </p>
            <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-[var(--color-ink-soft)]">
              <input
                type="checkbox"
                checked={filters.issuesOnly}
                onChange={(event) => {
                  setFilters({ ...filters, issuesOnly: event.target.checked })
                }}
                className="h-6 w-6 accent-[var(--color-brand-pink-dark)]"
              />
              Only teams that need attention
            </label>
          </div>
        </div>

        {visible.length === 0 ? (
          <EmptyState
            icon={<SnowflakeIcon size={30} />}
            title="No teams here yet"
            description="Pair two players on the bench above and they'll appear right here."
          />
        ) : (
          <Table>
            <caption className="sr-only">Teams by division, with seeds and validation.</caption>
            <TableHead>
              <tr>
                <TableHeaderCell>Seed</TableHeaderCell>
                <TableHeaderCell>Team</TableHeaderCell>
                <TableHeaderCell>Players</TableHeaderCell>
                <TableHeaderCell>Health</TableHeaderCell>
                <TableHeaderCell className="text-right">Manage</TableHeaderCell>
              </tr>
            </TableHead>
            <TableBody>
              {visible.map((team) => {
                const issues = issuesByTeam.get(team.id) ?? []
                const blocking = hasBlockingIssue(issues)
                const draft = seedDrafts[team.id] ?? (team.seed === null ? '' : team.seed.toString())
                return (
                  <TableRow key={team.id}>
                    <TableCell label="Seed" className="sm:whitespace-nowrap">
                      <span className="flex items-center justify-end gap-1.5 sm:justify-start">
                        <input
                          aria-label={`Seed for ${teamDisplayName(team)}`}
                          inputMode="numeric"
                          value={draft}
                          disabled={pending}
                          onChange={(event) => {
                            setSeedDrafts((current) => ({
                              ...current,
                              [team.id]: event.target.value,
                            }))
                          }}
                          onBlur={(event) => {
                            commitSeed(team, event.target.value)
                          }}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') event.currentTarget.blur()
                          }}
                          className={cn(inputClasses, 'w-16 px-2 py-1 text-center')}
                        />
                        {team.seed === null && (
                          <button
                            type="button"
                            disabled={pending}
                            title="Give this team the next free seed"
                            onClick={() => {
                              const next = nextAvailableSeed(team.divisionId, teams)
                              setSeedDrafts((current) => ({
                                ...current,
                                [team.id]: next.toString(),
                              }))
                              run(() => setTeamSeedAction({ teamId: team.id, seed: next }))
                            }}
                            className="rounded-full bg-[var(--color-brand-gold-light)] px-2 py-1 text-[0.65rem] font-bold text-[var(--color-brand-gold-dark)]"
                          >
                            Auto
                          </button>
                        )}
                      </span>
                    </TableCell>

                    <TableCell label="Team">
                      <span className="text-left">
                        <span className="block font-bold text-[var(--color-plum)]">
                          {teamDisplayName(team)}
                        </span>
                        <span className="block text-xs text-[var(--color-ink-muted)]">
                          {team.divisionName}
                          {team.isConfirmed ? ' · confirmed' : ' · unconfirmed'}
                        </span>
                      </span>
                    </TableCell>

                    <TableCell label="Players">
                      <span className="flex flex-col gap-2 text-left">
                        {team.members.length === 0 ? (
                          <span className="text-sm text-[var(--color-ink-muted)]">No players</span>
                        ) : (
                          team.members.map((member) => (
                            <MemberChip key={member.playerId} player={member} />
                          ))
                        )}
                      </span>
                    </TableCell>

                    <TableCell label="Health">
                      {issues.length === 0 ? (
                        <Badge status="approved">Ready</Badge>
                      ) : (
                        <span className="flex flex-col gap-1 text-left">
                          {issues.map((issue) => (
                            <span
                              key={issue.code}
                              className={cn(
                                'rounded-[var(--radius-md)] px-2 py-1 text-xs',
                                issue.severity === 'error'
                                  ? 'bg-[var(--color-danger-bg)] text-[var(--color-danger)]'
                                  : 'bg-[var(--color-warn-bg)] text-[var(--color-warn)]'
                              )}
                            >
                              {issue.message}
                            </span>
                          ))}
                        </span>
                      )}
                    </TableCell>

                    <TableCell label="Manage" className="sm:whitespace-nowrap sm:text-right">
                      <span className="flex flex-wrap justify-end gap-1.5 sm:flex-nowrap">
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          disabled={pending}
                          onClick={() => {
                            setRenaming(team)
                            setRenameValue(team.name ?? '')
                          }}
                        >
                          Rename
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant={blocking ? 'danger' : 'ghost'}
                          disabled={pending}
                          onClick={() => {
                            setDissolving(team)
                          }}
                        >
                          Dissolve
                        </Button>
                      </span>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {pools.map((pool) => {
            const state = capacityState(pool.teams, pool.maxTeams)
            return (
              <div
                key={pool.divisionId}
                className={cn(
                  'rounded-[var(--radius-md)] p-3.5 text-sm',
                  state === 'over' || state === 'full'
                    ? 'bg-[var(--color-warn-bg)] text-[var(--color-warn)]'
                    : 'bg-[var(--color-info-bg)] text-[var(--color-info)]'
                )}
              >
                <p className="font-[family-name:var(--font-heading)] font-bold">
                  {pool.divisionName}
                </p>
                <p className="mt-0.5">
                  {pool.teams} team{pool.teams === 1 ? '' : 's'}
                  {pool.maxTeams === null ? '' : ` of ${pool.maxTeams.toString()}`} ·{' '}
                  {pool.freeAgents} still on the bench
                  {pool.hasOddOneOut ? ' (one without a partner)' : ''}
                </p>
              </div>
            )
          })}
        </div>
      </section>

      <Modal
        open={renaming !== null}
        onClose={() => {
          setRenaming(null)
        }}
        title="Rename team"
        description="Leave it blank to fall back to the two players' names."
      >
        <div className="flex flex-col gap-3">
          <label
            htmlFor="rename-input"
            className="text-xs font-bold uppercase tracking-wide text-[var(--color-ink-muted)]"
          >
            Team name
          </label>
          <input
            id="rename-input"
            value={renameValue}
            maxLength={MAX_TEAM_NAME_LENGTH}
            onChange={(event) => {
              setRenameValue(event.target.value)
            }}
            placeholder="Tinsel Titans"
            className={cn(inputClasses, 'w-full font-normal')}
          />
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setRenaming(null)
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              disabled={pending}
              onClick={() => {
                const target = renaming
                if (!target) return
                run(() => renameTeamAction({ teamId: target.id, name: renameValue }), () => {
                  setRenaming(null)
                })
              }}
            >
              Save name
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={dissolving !== null}
        onClose={() => {
          setDissolving(null)
        }}
        title="Dissolve this team?"
        description="Both players go back to the pairing bench. The team's seed is released too."
      >
        <div className="flex flex-col gap-3">
          <p className="rounded-[var(--radius-md)] bg-[var(--color-warn-bg)] p-3 text-sm text-[var(--color-warn)]">
            {dissolving ? teamDisplayName(dissolving) : ''}
            {dissolving?.isConfirmed
              ? ' is confirmed and may already appear in the draw. Dissolving it will need the draw regenerating.'
              : ' will be removed and both players returned to the bench.'}
          </p>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setDissolving(null)
              }}
            >
              Keep them together
            </Button>
            <Button
              type="button"
              variant="danger"
              disabled={pending}
              onClick={() => {
                const target = dissolving
                if (!target) return
                run(
                  () => dissolveTeamAction({ teamId: target.id, force: target.isConfirmed }),
                  () => {
                    setDissolving(null)
                  }
                )
              }}
            >
              Yes, dissolve
            </Button>
          </div>
        </div>
      </Modal>

      {isDemo && (
        <p className="mt-6 text-center text-xs text-[var(--color-ink-muted)]">
          Demo mode — pairing, seeding and dissolving are previewed but never saved.
        </p>
      )}
    </>
  )
}
