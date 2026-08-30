'use client'

import { SnowflakeIcon } from '@/components/icons'
import { cn } from '@/lib/cn'
import { STAGE_LABELS } from '@/lib/schedule-admin'
import {
  MATCH_STATUSES,
  MATCH_STATUS_LABELS,
  type MatchFilters,
} from '@/lib/match-admin'
import type { MatchStage } from '@/lib/draw'
import type { MatchStatus } from '@/lib/supabase/types'

/**
 * Search and filters for the match console.
 *
 * Fully controlled — the parent owns the state so the result count stays in
 * step with the table and a filter change can never leave a dialog open over
 * a row that is no longer visible.
 */

const selectClasses =
  'w-full rounded-[var(--radius-pill)] border border-[var(--color-brand-lilac-light)] bg-white px-3.5 py-2 text-sm font-semibold text-[var(--color-plum)] shadow-[var(--shadow-soft)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-pink-dark)]'

const labelClasses =
  'mb-1 block text-xs font-bold uppercase tracking-wide text-[var(--color-ink-muted)]'

const STAGES: readonly MatchStage[] = ['elims', 'semi', 'third_place', 'final']

export function MatchesFilterBar({
  filters,
  divisions,
  onChange,
  resultCount,
  totalCount,
}: {
  filters: MatchFilters
  divisions: readonly { id: string; name: string }[]
  onChange: (next: MatchFilters) => void
  resultCount: number
  totalCount: number
}) {
  function patch(partial: Partial<MatchFilters>) {
    onChange({ ...filters, ...partial })
  }

  return (
    <div className="mb-4 rounded-[var(--radius-lg)] bg-frost-glass p-3.5 shadow-[var(--shadow-soft)]">
      <div className="flex flex-col gap-2.5 lg:flex-row lg:items-end">
        <div className="flex-1">
          <label htmlFor="matches-search" className={labelClasses}>
            Search
          </label>
          <div className="relative">
            <SnowflakeIcon
              size={16}
              aria-hidden="true"
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--color-brand-lilac-dark)]"
            />
            <input
              id="matches-search"
              type="search"
              value={filters.search}
              onChange={(event) => patch({ search: event.target.value })}
              placeholder="Pair, player, court or time…"
              className={cn(selectClasses, 'pl-9 font-normal')}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3 lg:w-auto">
          <div>
            <label htmlFor="matches-division" className={labelClasses}>
              Division
            </label>
            <select
              id="matches-division"
              value={filters.divisionId}
              onChange={(event) => patch({ divisionId: event.target.value })}
              className={selectClasses}
            >
              <option value="all">All divisions</option>
              {divisions.map((division) => (
                <option key={division.id} value={division.id}>
                  {division.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="matches-stage" className={labelClasses}>
              Stage
            </label>
            <select
              id="matches-stage"
              value={filters.stage}
              onChange={(event) => patch({ stage: event.target.value as MatchFilters['stage'] })}
              className={selectClasses}
            >
              <option value="all">All stages</option>
              {STAGES.map((stage) => (
                <option key={stage} value={stage}>
                  {STAGE_LABELS[stage]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="matches-status" className={labelClasses}>
              Status
            </label>
            <select
              id="matches-status"
              value={filters.status}
              onChange={(event) => patch({ status: event.target.value as MatchFilters['status'] })}
              className={selectClasses}
            >
              <option value="all">All statuses</option>
              <option value="undecided">Still to sort out</option>
              {MATCH_STATUSES.map((status: MatchStatus) => (
                <option key={status} value={status}>
                  {MATCH_STATUS_LABELS[status]}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <p className="mt-2.5 text-xs font-semibold text-[var(--color-ink-muted)]" aria-live="polite">
        Showing {resultCount} of {totalCount} matches
      </p>
    </div>
  )
}
