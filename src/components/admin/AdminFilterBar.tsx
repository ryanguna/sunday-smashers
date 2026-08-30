'use client'

import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { SnowflakeIcon } from '@/components/icons'
import {
  REGISTRATION_STATUS_LABELS,
  REGISTRATION_STATUSES,
  type AdminDivision,
  type PaidFilter,
  type RegistrationFilters,
} from '@/lib/admin'

/**
 * Search + filter controls shared by the registrations and payments pages.
 * Fully controlled — the parent owns the filter state so it can also reset
 * row selection whenever the visible set changes.
 */

const selectClasses =
  'w-full rounded-[var(--radius-pill)] border border-[var(--color-brand-lilac-light)] bg-white px-3.5 py-2 text-sm font-semibold text-[var(--color-plum)] shadow-[var(--shadow-soft)] focus:outline-none'

export function AdminFilterBar({
  filters,
  divisions,
  paidOptions,
  onChange,
  resultCount,
  totalCount,
  action,
  showFreeAgentToggle = true,
}: {
  filters: RegistrationFilters
  divisions: AdminDivision[]
  paidOptions: { value: PaidFilter; label: string }[]
  onChange: (next: RegistrationFilters) => void
  resultCount: number
  totalCount: number
  action?: ReactNode
  showFreeAgentToggle?: boolean
}) {
  function patch(partial: Partial<RegistrationFilters>) {
    onChange({ ...filters, ...partial })
  }

  return (
    <div className="mb-4 rounded-[var(--radius-lg)] bg-frost-glass p-3.5 shadow-[var(--shadow-soft)]">
      <div className="flex flex-col gap-2.5 lg:flex-row lg:items-end">
        <div className="flex-1">
          <label
            htmlFor="admin-search"
            className="mb-1 block text-xs font-bold uppercase tracking-wide text-[var(--color-ink-muted)]"
          >
            Search
          </label>
          <div className="relative">
            <SnowflakeIcon
              size={16}
              aria-hidden="true"
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--color-brand-lilac-dark)]"
            />
            <input
              id="admin-search"
              type="search"
              value={filters.search ?? ''}
              onChange={(event) => patch({ search: event.target.value })}
              placeholder="Name, nickname, phone, team…"
              className={cn(selectClasses, 'pl-9 font-normal')}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:w-auto">
          <div>
            <label
              htmlFor="admin-division"
              className="mb-1 block text-xs font-bold uppercase tracking-wide text-[var(--color-ink-muted)]"
            >
              Division
            </label>
            <select
              id="admin-division"
              value={filters.divisionId ?? 'all'}
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
            <label
              htmlFor="admin-status"
              className="mb-1 block text-xs font-bold uppercase tracking-wide text-[var(--color-ink-muted)]"
            >
              Status
            </label>
            <select
              id="admin-status"
              value={filters.status ?? 'all'}
              onChange={(event) =>
                patch({ status: event.target.value as RegistrationFilters['status'] })
              }
              className={selectClasses}
            >
              <option value="all">All statuses</option>
              {REGISTRATION_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {REGISTRATION_STATUS_LABELS[status]}
                </option>
              ))}
            </select>
          </div>

          <div className="col-span-2 sm:col-span-1">
            <label
              htmlFor="admin-paid"
              className="mb-1 block text-xs font-bold uppercase tracking-wide text-[var(--color-ink-muted)]"
            >
              Payment
            </label>
            <select
              id="admin-paid"
              value={filters.paid ?? 'all'}
              onChange={(event) => patch({ paid: event.target.value as PaidFilter })}
              className={selectClasses}
            >
              {paidOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {action && <div className="shrink-0 lg:pb-0.5">{action}</div>}
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-3">
        <p className="text-xs font-semibold text-[var(--color-ink-muted)]" aria-live="polite">
          Showing {resultCount} of {totalCount}
        </p>
        {showFreeAgentToggle && (
          <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-[var(--color-ink-soft)]">
            <input
              type="checkbox"
              checked={filters.freeAgentsOnly ?? false}
              onChange={(event) => patch({ freeAgentsOnly: event.target.checked })}
              className="h-4 w-4 accent-[var(--color-brand-pink-dark)]"
            />
            Free agents only (no partner yet)
          </label>
        )}
      </div>
    </div>
  )
}
