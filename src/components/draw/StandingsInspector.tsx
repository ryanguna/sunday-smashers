'use client'

import { useState } from 'react'

import { cn } from '@/lib/cn'
import { Badge, Button, Card, Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from '@/components/ui'
import { HollyIcon, MedalIcon, SparkleIcon } from '@/components/icons'
import {
  reorder,
  TIEBREAK_HINTS,
  TIEBREAK_LABELS,
  type DrawTeamEntry,
  type ResolvedStandingRow,
  type TieGroup,
} from '@/lib/draw-admin'
import { PanelHeading } from './DrawUI'

/**
 * The standings preview and tiebreak inspector.
 *
 * Every row shows the rule that put it where it is (`TiebreakReason` from
 * `computeStandings`). Rows the engine could not separate at all are
 * flagged loudly and get a manual ordering control — the draft rules stop
 * at "head to head", so a genuine three-way cycle is an admin's call.
 */
export function StandingsInspector({
  standings,
  teams,
  qualifyingPlaces,
}: {
  standings: ResolvedStandingRow[]
  teams: Map<string, DrawTeamEntry>
  qualifyingPlaces: number
}) {
  const nameOf = (id: string) => teams.get(id)?.name ?? id

  return (
    <Table>
      <caption className="sr-only">
        Round robin standings with the tiebreak rule applied to each position
      </caption>
      <TableHead>
        <TableRow>
          <TableHeaderCell>#</TableHeaderCell>
          <TableHeaderCell>Pair</TableHeaderCell>
          <TableHeaderCell>P</TableHeaderCell>
          <TableHeaderCell>W</TableHeaderCell>
          <TableHeaderCell>L</TableHeaderCell>
          <TableHeaderCell>Pts +/−</TableHeaderCell>
          <TableHeaderCell>Separated by</TableHeaderCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {standings.map((row) => {
          const qualified = row.rank <= qualifyingPlaces
          return (
            <TableRow
              key={row.teamId}
              className={cn(
                row.needsAdminDecision && 'bg-[var(--color-warn-bg)]',
                !row.needsAdminDecision && qualified && 'bg-[var(--color-success-bg)]/50'
              )}
            >
              <TableCell label="Rank">
                <span className="flex items-center gap-1.5 font-[family-name:var(--font-heading)] font-extrabold tabular-nums text-[var(--color-plum)]">
                  {qualified && (
                    <MedalIcon
                      size={15}
                      className="text-[var(--color-brand-gold-dark)]"
                      aria-label="Qualifies for the semi finals"
                    />
                  )}
                  {row.rank}
                </span>
              </TableCell>
              <TableCell label="Pair">
                <span className="min-w-0">
                  <span className="block truncate font-bold text-[var(--color-plum)]">
                    {nameOf(row.teamId)}
                  </span>
                  <span className="block truncate text-xs text-[var(--color-ink-muted)]">
                    {teams.get(row.teamId)?.players.join(' & ') ?? ''}
                  </span>
                </span>
              </TableCell>
              <TableCell label="Played">
                <span className="tabular-nums">{row.played}</span>
              </TableCell>
              <TableCell label="Won">
                <span className="font-bold tabular-nums text-[var(--color-success)]">{row.wins}</span>
              </TableCell>
              <TableCell label="Lost">
                <span className="tabular-nums">{row.losses}</span>
              </TableCell>
              <TableCell label="Points">
                <span className="tabular-nums">
                  {row.pointsFor}/{row.pointsAgainst}{' '}
                  <span
                    className={cn(
                      'font-bold',
                      row.pointDiff >= 0
                        ? 'text-[var(--color-success)]'
                        : 'text-[var(--color-danger)]'
                    )}
                  >
                    ({row.pointDiff >= 0 ? '+' : ''}
                    {row.pointDiff})
                  </span>
                </span>
              </TableCell>
              <TableCell label="Separated by">
                {row.manuallyResolved ? (
                  <Badge status="approved" className="text-xs">
                    Admin decision
                  </Badge>
                ) : row.needsAdminDecision ? (
                  <Badge status="pending" className="text-xs">
                    {TIEBREAK_LABELS.unresolved}
                  </Badge>
                ) : (
                  <span
                    className="text-xs text-[var(--color-ink-soft)]"
                    title={TIEBREAK_HINTS[row.tiebreak]}
                  >
                    {TIEBREAK_LABELS[row.tiebreak]}
                  </span>
                )}
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}

/**
 * One card per unresolved tie: the admin puts the tied pairs in the order
 * they have decided (coin toss, racket spin, however the committee calls
 * it) and records it. The decision is written to `audit_log`, so there is
 * always a paper trail for a placing that no rule produced.
 */
export function TiebreakResolver({
  group,
  teams,
  onResolve,
  busy = false,
}: {
  group: TieGroup
  teams: Map<string, DrawTeamEntry>
  onResolve: (teamIds: string[], note: string) => void
  busy?: boolean
}) {
  // The parent keys this component by the tied team ids, so a new tie
  // remounts it rather than needing an effect to resync `order`.
  const [order, setOrder] = useState<string[]>(group.teamIds)
  const [note, setNote] = useState('')

  const nameOf = (id: string) => teams.get(id)?.name ?? id
  const ranks = group.ranks

  return (
    <Card variant="outline" className="border-[var(--color-warn)]/40 bg-[var(--color-warn-bg)]/40">
      <PanelHeading
        icon={<HollyIcon size={18} className="text-[var(--color-warn)]" />}
        title={`Unresolved tie for ${ranks.length === 2 ? `${ordinal(ranks[0])} and ${ordinal(ranks[1])}` : `${ordinal(ranks[0])}–${ordinal(ranks[ranks.length - 1])}`}`}
        description="Every tiebreak came out level — a head-to-head cycle with identical point records. Put these pairs in the order the committee decided."
      />

      <ol className="flex flex-col gap-1.5">
        {order.map((teamId, index) => (
          <li
            key={teamId}
            className="flex items-center gap-2.5 rounded-[var(--radius-md)] bg-white px-2.5 py-2 shadow-[var(--shadow-soft)]"
          >
            <span
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[image:var(--gradient-gold)] font-[family-name:var(--font-heading)] text-xs font-extrabold text-[var(--color-plum)] tabular-nums"
              aria-hidden="true"
            >
              {ranks[index]}
            </span>
            <span className="min-w-0 flex-1 truncate text-sm font-bold text-[var(--color-plum)]">
              {nameOf(teamId)}
            </span>
            <span className="flex shrink-0 gap-1">
              <button
                type="button"
                disabled={busy || index === 0}
                onClick={() => setOrder(reorder(order, index, index - 1))}
                aria-label={`Move ${nameOf(teamId)} up to ${ordinal(ranks[index - 1] ?? ranks[0])}`}
                className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--color-brand-lilac-light)] text-sm font-bold text-[var(--color-brand-lilac-dark)] transition-transform hover:scale-110 disabled:opacity-30 disabled:hover:scale-100"
              >
                <span aria-hidden="true">▲</span>
              </button>
              <button
                type="button"
                disabled={busy || index === order.length - 1}
                onClick={() => setOrder(reorder(order, index, index + 1))}
                aria-label={`Move ${nameOf(teamId)} down to ${ordinal(ranks[index + 1] ?? ranks[ranks.length - 1])}`}
                className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--color-brand-lilac-light)] text-sm font-bold text-[var(--color-brand-lilac-dark)] transition-transform hover:scale-110 disabled:opacity-30 disabled:hover:scale-100"
              >
                <span aria-hidden="true">▼</span>
              </button>
            </span>
          </li>
        ))}
      </ol>

      <label className="mt-3 block text-sm">
        <span className="mb-1 block font-semibold text-[var(--color-plum)]">
          How was it decided? (goes in the audit log)
        </span>
        <input
          type="text"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Racket spin at the front desk, witnessed by both pairs"
          className="w-full rounded-[var(--radius-md)] border border-[var(--color-brand-lilac-light)] bg-white px-3 py-2 text-sm text-[var(--color-plum)] outline-none focus:ring-2 focus:ring-[var(--color-brand-lilac)]"
        />
      </label>

      <div className="mt-3">
        <Button size="sm" loading={busy} onClick={() => onResolve(order, note)}>
          <SparkleIcon size={16} aria-hidden="true" />
          Record this decision
        </Button>
      </div>
    </Card>
  )
}

function ordinal(value: number): string {
  const suffix =
    value % 100 >= 11 && value % 100 <= 13
      ? 'th'
      : value % 10 === 1
        ? 'st'
        : value % 10 === 2
          ? 'nd'
          : value % 10 === 3
            ? 'rd'
            : 'th'
  return `${value}${suffix}`
}
