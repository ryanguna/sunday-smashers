'use client'

import { useMemo } from 'react'

import { Badge, Button, Card, EmptyState } from '@/components/ui'
import { ShuttlecockIcon, SnowflakeIcon, SparkleIcon } from '@/components/icons'
import { PAYMENT_STATUS_LABELS, REGISTRATION_STATUS_LABELS, formatAdminDate, initials } from '@/lib/admin'
import type { AdminDivision } from '@/lib/admin'
import { cn } from '@/lib/cn'
import {
  TEAM_SIZE,
  sortFreeAgents,
  summarisePairingPool,
  type AdminTeam,
  type TeamPlayer,
} from '@/lib/teams-admin'
import type { BadgeStatus } from '@/components/ui'

/**
 * The pairing queue: every solo registration, grouped by division, with the
 * fact an admin actually pairs on (skill level) plus their approval and
 * payment state.
 *
 * Selection is capped at two players — doubles is doubles.
 */

function statusBadge(status: TeamPlayer['status']): BadgeStatus {
  if (status === 'approved') return 'approved'
  if (status === 'rejected') return 'forfeit'
  return 'pending'
}

function paymentBadge(status: TeamPlayer['paymentStatus']): BadgeStatus {
  if (status === 'paid') return 'paid'
  if (status === 'partial') return 'pending'
  return 'unpaid'
}

function FreeAgentCard({
  player,
  selected,
  disabled,
  onToggle,
}: {
  player: TeamPlayer
  selected: boolean
  disabled: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled && !selected}
      onClick={onToggle}
      className={cn(
        'hover-lift w-full rounded-[var(--radius-md)] border-2 bg-white p-3 text-left transition-colors',
        selected
          ? 'border-[var(--color-brand-pink-dark)] bg-[var(--color-brand-pink-light)]'
          : 'border-[var(--color-brand-lilac-light)]',
        disabled && !selected && 'cursor-not-allowed'
      )}
    >
      <span className="flex items-start gap-2.5">
        <span
          aria-hidden="true"
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-extrabold',
            selected
              ? 'bg-[var(--color-brand-pink-dark)] text-white'
              : 'bg-[image:var(--gradient-frost)] text-[var(--color-plum)]'
          )}
        >
          {selected ? <SparkleIcon size={18} /> : initials(player.name)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="font-[family-name:var(--font-heading)] font-bold text-[var(--color-plum)]">
              {player.name}
            </span>
            {player.nickname && (
              <span className="text-xs text-[var(--color-ink-muted)]">“{player.nickname}”</span>
            )}
          </span>
          <span className="mt-0.5 block text-xs text-[var(--color-ink-soft)]">
            <span className="capitalize">{player.skillLevel ?? 'skill unknown'}</span>
            {' · joined '}
            {formatAdminDate(player.createdAt)}
          </span>
          <span className="mt-1.5 flex flex-wrap gap-1.5">
            <Badge status={statusBadge(player.status)}>
              {REGISTRATION_STATUS_LABELS[player.status]}
            </Badge>
            <Badge status={paymentBadge(player.paymentStatus)}>
              {PAYMENT_STATUS_LABELS[player.paymentStatus]}
            </Badge>
          </span>
        </span>
      </span>
    </button>
  )
}

export function TeamsPairingBench({
  freeAgents,
  divisions,
  teams,
  selectedIds,
  onToggle,
  onAutoPair,
  busy,
}: {
  freeAgents: TeamPlayer[]
  divisions: AdminDivision[]
  teams: Pick<AdminTeam, 'divisionId'>[]
  selectedIds: string[]
  onToggle: (playerId: string) => void
  onAutoPair: (divisionId: string) => void
  busy: boolean
}) {
  const pools = useMemo(
    () => summarisePairingPool(freeAgents, teams, divisions),
    [freeAgents, teams, divisions]
  )
  const sorted = useMemo(() => sortFreeAgents(freeAgents), [freeAgents])
  const atCapacity = selectedIds.length >= TEAM_SIZE

  if (freeAgents.length === 0) {
    return (
      <EmptyState
        icon={<ShuttlecockIcon size={30} />}
        title="Everyone has a partner"
        description="The pairing queue is empty — every registered player is on a team. Merry pairing! 🎄"
      />
    )
  }

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      {divisions.map((division) => {
        const pool = sorted.filter((player) => player.divisionId === division.id)
        const summary = pools.find((p) => p.divisionId === division.id)
        return (
          <Card key={division.id} variant="frosted" className="p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <h3 className="flex items-center gap-1.5 text-base font-extrabold text-[var(--color-plum)]">
                  <SnowflakeIcon
                    size={18}
                    aria-hidden="true"
                    className="shrink-0 text-[var(--color-brand-sky-dark)]"
                  />
                  {division.name}
                </h3>
                <p className="mt-0.5 text-xs text-[var(--color-ink-soft)]">
                  {pool.length} waiting
                  {summary && summary.possiblePairs > 0
                    ? ` · ${summary.possiblePairs.toString()} pair${summary.possiblePairs === 1 ? '' : 's'} possible`
                    : ''}
                  {summary?.hasOddOneOut ? ' · one will be left over' : ''}
                </p>
              </div>
              {summary && summary.possiblePairs > 0 && (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => {
                    onAutoPair(division.id)
                  }}
                >
                  Suggest &amp; pair all
                </Button>
              )}
            </div>

            {pool.length === 0 ? (
              <p className="rounded-[var(--radius-md)] bg-[var(--color-success-bg)] p-3 text-sm text-[var(--color-success)]">
                Nobody waiting in this division. 🎁
              </p>
            ) : (
              <ul className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                {pool.map((player) => (
                  <li key={player.playerId}>
                    <FreeAgentCard
                      player={player}
                      selected={selectedIds.includes(player.playerId)}
                      disabled={atCapacity}
                      onToggle={() => {
                        onToggle(player.playerId)
                      }}
                    />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )
      })}
    </div>
  )
}
