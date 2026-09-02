'use client'

import { useMemo, useState, useTransition } from 'react'
import {
  Badge,
  Button,
  EmptyState,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
  useToast,
} from '@/components/ui'
import { GiftIcon, ShuttlecockIcon, SnowflakeIcon } from '@/components/icons'
import { cn } from '@/lib/cn'
import {
  csvFilename,
  derivePaymentStatus,
  filterRegistrations,
  formatAdminDate,
  formatCents,
  initials,
  PAYMENT_STATUS_LABELS,
  planBulkTransition,
  REGISTRATION_STATUS_CHEER,
  REGISTRATION_STATUS_LABELS,
  REGISTRATION_STATUSES,
  toRegistrationsCsv,
  type AdminDivision,
  type AdminRegistration,
  type PaidFilter,
  type RegistrationFilters,
} from '@/lib/admin'
import type { BadgeStatus } from '@/components/ui'
import type { RegistrationStatus } from '@/lib/supabase/types'
import { updateRegistrationStatusAction } from './actions'
import { AdminFilterBar } from './AdminFilterBar'

/**
 * The registrations workbench: search, filter, review (individually or in
 * bulk) and export. Admin-only contact details live behind a per-row
 * "Details" disclosure so the dense table stays scannable and the PII isn't
 * splashed across a projector at the venue.
 */

const STATUS_BADGE: Record<RegistrationStatus, BadgeStatus> = {
  pending: 'pending',
  approved: 'approved',
  waitlisted: 'info',
  rejected: 'forfeit',
}

const PAID_FILTER_OPTIONS: { value: PaidFilter; label: string }[] = [
  { value: 'all', label: 'Any payment' },
  { value: 'paid', label: 'Paid' },
  { value: 'partial', label: 'Partial' },
  { value: 'unpaid', label: 'Unpaid' },
  { value: 'outstanding', label: 'Owes money' },
]

const ACTION_TONES = {
  approve: {
    className:
      'bg-[var(--color-success-bg)] text-[var(--color-success)] hover:bg-[var(--color-success)] hover:text-white',
    glyph: (
      <path
        d="M5 12.5l4.5 4.5L19 7"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
  },
  waitlist: {
    className:
      'bg-[var(--color-warn-bg)] text-[var(--color-warn)] hover:bg-[var(--color-warn)] hover:text-white',
    glyph: (
      <>
        <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="2.2" />
        <path d="M12 8v4.5l3 1.8" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      </>
    ),
  },
  reject: {
    className:
      'bg-[var(--color-danger-bg)] text-[var(--color-danger)] hover:bg-[var(--color-danger)] hover:text-white',
    glyph: (
      <path
        d="M7 7l10 10M17 7L7 17"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
    ),
  },
  details: {
    className:
      'bg-[var(--color-brand-lilac-light)] text-[var(--color-brand-lilac-dark)] hover:bg-[var(--color-brand-lilac-dark)] hover:text-white',
    glyph: (
      <>
        <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="2" />
        <path
          d="M12 11v5.5M12 7.6v.6"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
        />
      </>
    ),
  },
} as const

/**
 * Compact per-row review control. Icon-only (with an accessible name and a
 * native tooltip) so a dense 50-row table stays one line per player, on a
 * phone as well as a laptop.
 */
function ActionButton({
  label,
  tone,
  disabled,
  expanded,
  onClick,
}: {
  label: string
  tone: keyof typeof ACTION_TONES
  disabled?: boolean
  expanded?: boolean
  onClick: () => void
}) {
  const config = ACTION_TONES[tone]
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-expanded={expanded}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors disabled:opacity-35 disabled:hover:bg-inherit disabled:hover:text-inherit',
        config.className,
      )}
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        {config.glyph}
      </svg>
    </button>
  )
}

function downloadCsv(rows: readonly AdminRegistration[]) {
  const csv = toRegistrationsCsv(rows)
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = csvFilename('registrations', new Date().toISOString())
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export function RegistrationsClient({
  registrations,
  divisions,
  initialFilters,
}: {
  registrations: AdminRegistration[]
  divisions: AdminDivision[]
  initialFilters?: Partial<RegistrationFilters>
}) {
  const [filters, setFilters] = useState<RegistrationFilters>({
    search: '',
    divisionId: 'all',
    status: 'all',
    paid: 'all',
    freeAgentsOnly: false,
    ...initialFilters,
  })
  const [selected, setSelected] = useState<string[]>([])
  const [expanded, setExpanded] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const { toast } = useToast()

  const visible = useMemo(
    () => filterRegistrations(registrations, filters),
    [registrations, filters],
  )
  const selectedRows = useMemo(
    () => visible.filter((row) => selected.includes(row.id)),
    [visible, selected],
  )
  const allVisibleSelected = visible.length > 0 && visible.every((row) => selected.includes(row.id))

  function toggleRow(id: string) {
    setSelected((current) =>
      current.includes(id) ? current.filter((rowId) => rowId !== id) : [...current, id],
    )
  }

  function toggleAll() {
    setSelected(allVisibleSelected ? [] : visible.map((row) => row.id))
  }

  function applyStatus(rows: AdminRegistration[], next: RegistrationStatus) {
    const { eligible, skipped } = planBulkTransition(rows, next)
    if (eligible.length === 0) {
      toast({
        variant: 'warning',
        title: 'Nothing to change',
        description: `Already ${REGISTRATION_STATUS_LABELS[next].toLowerCase()}.`,
      })
      return
    }
    startTransition(async () => {
      const result = await updateRegistrationStatusAction(
        eligible.map((row) => row.id),
        next,
      )
      toast({
        variant: result.ok ? 'success' : result.demo ? 'default' : 'danger',
        title: result.ok
          ? `${REGISTRATION_STATUS_LABELS[next]} — ${eligible.length} player${eligible.length === 1 ? '' : 's'}`
          : 'Not saved',
        description:
          result.message +
          (skipped.length > 0 ? ` (${skipped.length} skipped — already there.)` : ''),
      })
      if (result.ok) setSelected([])
    })
  }

  return (
    <>
      <AdminFilterBar
        filters={filters}
        divisions={divisions}
        paidOptions={PAID_FILTER_OPTIONS}
        onChange={(next) => {
          setFilters(next)
          setSelected([])
        }}
        resultCount={visible.length}
        totalCount={registrations.length}
        action={
          <Button
            type="button"
            variant="festive"
            size="sm"
            onClick={() => downloadCsv(visible)}
            disabled={visible.length === 0}
          >
            <GiftIcon size={16} aria-hidden="true" />
            Export CSV ({visible.length})
          </Button>
        }
      />

      {/* Bulk action bar */}
      <div
        className={cn(
          'mb-4 flex flex-wrap items-center gap-2 rounded-[var(--radius-lg)] px-4 py-3 transition-colors',
          selectedRows.length > 0
            ? 'bg-[image:var(--gradient-candy)] text-white shadow-[var(--shadow-glow-pink)]'
            : 'bg-white/70 text-[var(--color-ink-muted)] shadow-[var(--shadow-soft)]',
        )}
        aria-live="polite"
      >
        <span className="font-[family-name:var(--font-heading)] text-sm font-bold">
          {selectedRows.length > 0
            ? `${selectedRows.length} selected`
            : 'Tick some players for bulk actions'}
        </span>
        <div className="ml-auto flex flex-wrap gap-2">
          {REGISTRATION_STATUSES.map((status) => (
            <Button
              key={status}
              type="button"
              size="sm"
              variant={selectedRows.length > 0 ? 'secondary' : 'ghost'}
              disabled={selectedRows.length === 0 || pending}
              onClick={() => applyStatus(selectedRows, status)}
            >
              {REGISTRATION_STATUS_LABELS[status]}
            </Button>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon={<SnowflakeIcon size={30} />}
          title="No registrations match those filters"
          description="Try clearing the search box or switching the division back to “All divisions”."
          action={
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() =>
                setFilters({
                  search: '',
                  divisionId: 'all',
                  status: 'all',
                  paid: 'all',
                  freeAgentsOnly: false,
                })
              }
            >
              Clear filters
            </Button>
          }
        />
      ) : (
        <Table>
          <caption className="sr-only">
            Registrations, with review actions and admin-only contact details.
          </caption>
          <TableHead>
            <tr>
              <TableHeaderCell className="w-10">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={toggleAll}
                    className="h-4 w-4 accent-[var(--color-brand-pink-dark)]"
                  />
                  <span className="sr-only">Select all visible registrations</span>
                </label>
              </TableHeaderCell>
              <TableHeaderCell>Player</TableHeaderCell>
              <TableHeaderCell>Partner / team</TableHeaderCell>
              <TableHeaderCell>Skill level</TableHeaderCell>
              <TableHeaderCell>Status</TableHeaderCell>
              <TableHeaderCell>Payment</TableHeaderCell>
              <TableHeaderCell className="text-right">Review</TableHeaderCell>
            </tr>
          </TableHead>
          <TableBody>
            {visible.map((row) => {
              const paymentStatus = derivePaymentStatus(
                row.payment.amountPaidCents,
                row.payment.amountCents,
              )
              const isSelected = selected.includes(row.id)
              const isOpen = expanded === row.id
              const mainRow = (
                <TableRow
                  key={row.id}
                  className={cn(isSelected && 'bg-[var(--color-brand-pink-light)]/40')}
                >
                  <TableCell className="sm:w-10">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleRow(row.id)}
                        className="h-4 w-4 accent-[var(--color-brand-pink-dark)]"
                      />
                      <span className="sr-only">Select {row.playerName}</span>
                    </label>
                  </TableCell>
                  <TableCell label="Player">
                    <span className="flex items-center gap-2 text-left">
                      <span
                        aria-hidden="true"
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[image:var(--gradient-mint-sky)] text-xs font-extrabold text-white"
                      >
                        {initials(row.playerName)}
                      </span>
                      <span className="min-w-0">
                        <span className="block font-bold text-[var(--color-plum)]">
                          {row.playerName}
                        </span>
                        <span className="block text-xs text-[var(--color-ink-muted)]">
                          {row.nickname ? `“${row.nickname}” · ` : ''}
                          {row.divisionName}
                        </span>
                        <span className="block text-[0.68rem] text-[var(--color-ink-muted)]">
                          Registered {formatAdminDate(row.createdAt)}
                        </span>
                      </span>
                    </span>
                  </TableCell>
                  <TableCell label="Partner / team">
                    {row.partnerName ? (
                      <span className="text-left">
                        <span className="block text-sm">{row.partnerName}</span>
                        {row.teamName && (
                          <span className="block text-xs text-[var(--color-ink-muted)]">
                            {row.teamName}
                          </span>
                        )}
                      </span>
                    ) : (
                      <span className="rounded-[var(--radius-pill)] bg-[var(--color-brand-gold-light)] px-2.5 py-1 text-xs font-bold text-[var(--color-brand-gold-dark)]">
                        Free agent
                      </span>
                    )}
                  </TableCell>
                  <TableCell label="Skill level">
                    <span className="text-left">
                      <span className="block font-bold capitalize text-[var(--color-plum)]">
                        {row.skillLevel ?? '—'}
                      </span>
                    </span>
                  </TableCell>
                  <TableCell label="Status">
                    <Badge
                      status={STATUS_BADGE[row.status]}
                      title={REGISTRATION_STATUS_CHEER[row.status]}
                    >
                      {REGISTRATION_STATUS_LABELS[row.status]}
                    </Badge>
                  </TableCell>
                  <TableCell label="Payment">
                    <span className="text-left">
                      <Badge
                        status={
                          paymentStatus === 'paid'
                            ? 'paid'
                            : paymentStatus === 'partial'
                              ? 'pending'
                              : 'unpaid'
                        }
                      >
                        {PAYMENT_STATUS_LABELS[paymentStatus]}
                      </Badge>
                      <span className="mt-0.5 block text-xs text-[var(--color-ink-muted)]">
                        {formatCents(row.payment.amountPaidCents)} of{' '}
                        {formatCents(row.payment.amountCents)}
                      </span>
                    </span>
                  </TableCell>
                  <TableCell label="Review" className="sm:text-right">
                    <span className="flex flex-nowrap justify-end gap-1">
                      <ActionButton
                        label="Approve"
                        tone="approve"
                        disabled={pending || row.status === 'approved'}
                        onClick={() => applyStatus([row], 'approved')}
                      />
                      <ActionButton
                        label="Waitlist"
                        tone="waitlist"
                        disabled={pending || row.status === 'waitlisted'}
                        onClick={() => applyStatus([row], 'waitlisted')}
                      />
                      <ActionButton
                        label="Reject"
                        tone="reject"
                        disabled={pending || row.status === 'rejected'}
                        onClick={() => applyStatus([row], 'rejected')}
                      />
                      <ActionButton
                        label={isOpen ? 'Hide details' : 'Show details'}
                        tone="details"
                        expanded={isOpen}
                        onClick={() => setExpanded(isOpen ? null : row.id)}
                      />
                    </span>
                  </TableCell>
                </TableRow>
              )

              const detailsRow = isOpen ? (
                <TableRow
                  key={`${row.id}-details`}
                  className="sm:bg-[var(--color-brand-lilac-light)]/25"
                >
                  <TableCell colSpan={7} className="sm:px-4 sm:py-3">
                    <div className="w-full text-left text-sm">
                      <p className="mb-1.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-[var(--color-ink-muted)]">
                        <ShuttlecockIcon size={14} aria-hidden="true" />
                        Admin-only contact details — {row.playerName}
                      </p>
                      <dl className="grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-3 lg:grid-cols-5">
                        <div>
                          <dt className="text-xs text-[var(--color-ink-muted)]">Email</dt>
                          <dd className="break-words">{row.email ?? '—'}</dd>
                        </div>
                        <div>
                          <dt className="text-xs text-[var(--color-ink-muted)]">Phone</dt>
                          <dd>{row.phone ?? '—'}</dd>
                        </div>
                        <div>
                          <dt className="text-xs text-[var(--color-ink-muted)]">
                            Emergency contact
                          </dt>
                          <dd>{row.emergencyContactName ?? '—'}</dd>
                        </div>
                        <div>
                          <dt className="text-xs text-[var(--color-ink-muted)]">Emergency phone</dt>
                          <dd>{row.emergencyContactPhone ?? '—'}</dd>
                        </div>
                        <div>
                          <dt className="text-xs text-[var(--color-ink-muted)]">Notes</dt>
                          <dd>{row.notes ?? '—'}</dd>
                        </div>
                      </dl>
                    </div>
                  </TableCell>
                </TableRow>
              ) : null

              return detailsRow ? [mainRow, detailsRow] : mainRow
            })}
          </TableBody>
        </Table>
      )}
    </>
  )
}
