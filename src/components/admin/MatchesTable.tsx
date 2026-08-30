'use client'

import {
  Badge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
  Button,
} from '@/components/ui'
import type { BadgeStatus } from '@/components/ui'
import { isDecidedStatus, roundLabel, whereAndWhen, type AdminMatchRow } from '@/lib/match-admin'
import { MATCH_STATUS_LABELS } from '@/lib/match-admin'
import type { MatchStatus } from '@/lib/supabase/types'

/**
 * The match table.
 *
 * Presentational only — every action is raised to the console, which owns the
 * dialogs. On a phone the shared `Table` primitives stack each row into a
 * card, so an admin standing in the hall gets the same information without a
 * horizontal scroll.
 */

/** Reuses the shared badge palette; no new colour pairs are introduced. */
function badgeStatusFor(status: MatchStatus): BadgeStatus {
  if (status === 'in_progress') return 'live'
  if (status === 'forfeited' || status === 'cancelled') return 'forfeit'
  if (isDecidedStatus(status)) return 'final'
  return 'info'
}

function scoreText(row: AdminMatchRow): string {
  if (row.status === 'scheduled' || row.status === 'cancelled') return '—'
  return `${row.scoreA}–${row.scoreB}`
}

function winnerName(row: AdminMatchRow): string | null {
  if (!row.winnerTeamId) return null
  if (row.winnerTeamId === row.teamA.id) return row.teamA.name
  if (row.winnerTeamId === row.teamB.id) return row.teamB.name
  return null
}

export function MatchesTable({
  rows,
  onEditResult,
  onReschedule,
}: {
  rows: readonly AdminMatchRow[]
  onEditResult: (row: AdminMatchRow) => void
  onReschedule: (row: AdminMatchRow) => void
}) {
  return (
    <Table>
      <caption className="sr-only">
        Every match in the tournament, with its score, status and admin actions.
      </caption>
      <TableHead>
        <tr>
          <TableHeaderCell>Court &amp; time</TableHeaderCell>
          <TableHeaderCell>Match</TableHeaderCell>
          <TableHeaderCell>Score</TableHeaderCell>
          <TableHeaderCell>Status</TableHeaderCell>
          <TableHeaderCell>
            <span className="sr-only">Actions</span>
          </TableHeaderCell>
        </tr>
      </TableHead>
      <TableBody>
        {rows.map((row) => {
          const winner = winnerName(row)
          return (
            <TableRow key={row.id}>
              <TableCell label="Court & time">
                <span className="font-semibold text-[var(--color-plum)]">{whereAndWhen(row)}</span>
                <span className="block text-xs text-[var(--color-ink-muted)]">
                  {row.divisionName} · {roundLabel(row)}
                </span>
              </TableCell>

              <TableCell label="Match">
                <span className="font-semibold text-[var(--color-plum)]">
                  {row.teamA.name} <span className="text-[var(--color-ink-muted)]">v</span>{' '}
                  {row.teamB.name}
                </span>
                {winner && (
                  <span className="block text-xs text-[var(--color-ink-soft)]">
                    Winner: {winner}
                  </span>
                )}
                {row.forfeitReason && (
                  <span className="block text-xs text-[var(--color-ink-soft)]">
                    {row.forfeitReason}
                  </span>
                )}
              </TableCell>

              <TableCell label="Score">
                <span className="font-[family-name:var(--font-heading)] text-lg font-extrabold text-[var(--color-plum)]">
                  {scoreText(row)}
                </span>
              </TableCell>

              <TableCell label="Status">
                <span className="inline-flex flex-wrap items-center justify-end gap-1.5 sm:justify-start">
                  <Badge status={badgeStatusFor(row.status)}>
                    {MATCH_STATUS_LABELS[row.status]}
                  </Badge>
                  {row.scoresheetStatus === 'verified' && (
                    <Badge status="approved" title="A tabulator has verified this scoresheet">
                      Verified
                    </Badge>
                  )}
                  {row.scoresheetStatus === 'disputed' && <Badge status="pending">Disputed</Badge>}
                </span>
              </TableCell>

              <TableCell label="Actions" className="w-px whitespace-nowrap">
                <span className="inline-flex flex-wrap justify-end gap-1.5 sm:justify-start">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => onEditResult(row)}
                    aria-label={`Edit the result of ${row.teamA.name} versus ${row.teamB.name}`}
                  >
                    Result
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onReschedule(row)}
                    aria-label={`Move ${row.teamA.name} versus ${row.teamB.name} to another court or time`}
                  >
                    Move
                  </Button>
                </span>
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}
