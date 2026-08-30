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
} from '@/components/ui'
import { GiftIcon, SnowflakeIcon } from '@/components/icons'
import { StatCard } from './AdminUI'
import {
  clampPaidAmount,
  computeReconciliation,
  derivePaymentStatus,
  filterRegistrations,
  formatCents,
  initials,
  parseAmountToCents,
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHODS,
  PAYMENT_STATUS_LABELS,
  REGISTRATION_STATUS_LABELS,
  type AdminDivision,
  type AdminRegistration,
  type PaidFilter,
  type PaymentMethod,
  type RegistrationFilters,
} from '@/lib/admin'
import type { PaymentStatus } from '@/lib/supabase/types'
import { updatePaymentAction } from './actions'
import { AdminFilterBar } from './AdminFilterBar'

/**
 * The payments desk: mark players unpaid / partial / paid with an amount,
 * a method and a reference note, and reconcile the running total against
 * what's expected.
 */

const PAID_FILTER_OPTIONS: { value: PaidFilter; label: string }[] = [
  { value: 'all', label: 'Any payment' },
  { value: 'unpaid', label: 'Unpaid' },
  { value: 'partial', label: 'Partial' },
  { value: 'paid', label: 'Paid' },
  { value: 'outstanding', label: 'Owes money' },
]

function paymentBadge(status: PaymentStatus) {
  return status === 'paid' ? 'paid' : status === 'partial' ? 'pending' : 'unpaid'
}

interface DraftPayment {
  row: AdminRegistration
  amountText: string
  method: PaymentMethod | ''
  reference: string
}

export function PaymentsClient({
  registrations,
  divisions,
}: {
  registrations: AdminRegistration[]
  divisions: AdminDivision[]
}) {
  const [filters, setFilters] = useState<RegistrationFilters>({
    search: '',
    divisionId: 'all',
    status: 'all',
    paid: 'all',
    freeAgentsOnly: false,
  })
  const [draft, setDraft] = useState<DraftPayment | null>(null)
  const [pending, startTransition] = useTransition()
  const { toast } = useToast()

  const visible = useMemo(
    () => filterRegistrations(registrations, filters),
    [registrations, filters],
  )
  const totals = useMemo(() => computeReconciliation(registrations), [registrations])
  const visibleTotals = useMemo(() => computeReconciliation(visible), [visible])

  function openDraft(row: AdminRegistration) {
    setDraft({
      row,
      amountText: (row.payment.amountPaidCents / 100).toFixed(2),
      method: row.payment.method ?? '',
      reference: row.payment.reference ?? '',
    })
  }

  function save(next: DraftPayment, overrideCents?: number) {
    const parsed = overrideCents ?? parseAmountToCents(next.amountText)
    if (parsed === null) {
      toast({
        variant: 'danger',
        title: 'That amount looks odd',
        description: 'Enter a dollar amount like 25 or 12.50.',
      })
      return
    }
    const amountPaidCents = clampPaidAmount(parsed, next.row.payment.amountCents)
    startTransition(async () => {
      const result = await updatePaymentAction({
        registrationId: next.row.id,
        paymentId: next.row.payment.id,
        amountCents: next.row.payment.amountCents,
        amountPaidCents,
        method: next.method === '' ? null : next.method,
        reference: next.reference,
      })
      toast({
        variant: result.ok ? 'success' : result.demo ? 'default' : 'danger',
        title: result.ok ? `${next.row.playerName} — payment saved` : 'Not saved',
        description: result.message,
      })
      if (result.ok) setDraft(null)
    })
  }

  const collectionPercent = Math.round(totals.collectionRate * 100)

  return (
    <>
      <section aria-labelledby="pay-recon" className="mb-5">
        <h2 id="pay-recon" className="sr-only">
          Reconciliation
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Collected"
            value={formatCents(totals.collectedCents)}
            hint={`${collectionPercent}% of expected`}
            tone="mint"
            icon={<GiftIcon size={20} />}
          />
          <StatCard
            label="Expected"
            value={formatCents(totals.expectedCents)}
            hint={`${totals.count} playing entries`}
            tone="lilac"
          />
          <StatCard
            label="Outstanding"
            value={formatCents(totals.outstandingCents)}
            hint={`${totals.byStatus.unpaid} unpaid · ${totals.byStatus.partial} partial`}
            tone="pink"
          />
          <StatCard
            label="Fully paid"
            value={totals.byStatus.paid}
            hint="Entries settled in full"
            tone="gold"
          />
        </div>
        <Card variant="frosted" className="mt-3 p-4">
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-[var(--color-ink-muted)]">
            Collected by method
          </p>
          <div className="flex flex-wrap gap-2">
            {PAYMENT_METHODS.map((method) => (
              <span
                key={method}
                className="rounded-[var(--radius-pill)] bg-white px-3 py-1.5 text-sm font-semibold text-[var(--color-plum)] shadow-[var(--shadow-soft)]"
              >
                {PAYMENT_METHOD_LABELS[method]}
                <span className="ml-2 font-extrabold text-[var(--color-brand-mint-dark)]">
                  {formatCents(totals.byMethodCents[method])}
                </span>
              </span>
            ))}
          </div>
        </Card>
      </section>

      <AdminFilterBar
        filters={filters}
        divisions={divisions}
        paidOptions={PAID_FILTER_OPTIONS}
        onChange={setFilters}
        resultCount={visible.length}
        totalCount={registrations.length}
        showFreeAgentToggle={false}
        action={
          <span className="inline-flex items-center gap-2 rounded-[var(--radius-pill)] bg-[var(--color-brand-mint-light)] px-3.5 py-2 text-sm font-bold text-[var(--color-brand-mint-dark)]">
            Filtered total {formatCents(visibleTotals.collectedCents)}
          </span>
        }
      />

      {visible.length === 0 ? (
        <EmptyState
          icon={<SnowflakeIcon size={30} />}
          title="No payments match those filters"
          description="Everyone matching this filter is squared away — or the filters are too tight."
        />
      ) : (
        <Table>
          <caption className="sr-only">Entry fee payments by player.</caption>
          <TableHead>
            <tr>
              <TableHeaderCell>Player</TableHeaderCell>
              <TableHeaderCell>Division</TableHeaderCell>
              <TableHeaderCell>Paid / entry</TableHeaderCell>
              <TableHeaderCell>Method &amp; reference</TableHeaderCell>
              <TableHeaderCell>Status</TableHeaderCell>
              <TableHeaderCell className="text-right">Record</TableHeaderCell>
            </tr>
          </TableHead>
          <TableBody>
            {visible.map((row) => {
              const status = derivePaymentStatus(
                row.payment.amountPaidCents,
                row.payment.amountCents,
              )
              return (
                <TableRow key={row.id}>
                  <TableCell label="Player" className="sm:whitespace-nowrap">
                    <span className="flex items-center gap-2 text-left">
                      <span
                        aria-hidden="true"
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[image:var(--gradient-gold)] text-xs font-extrabold text-[var(--color-plum)]"
                      >
                        {initials(row.playerName)}
                      </span>
                      <span className="min-w-0">
                        <span className="block font-bold text-[var(--color-plum)]">
                          {row.playerName}
                        </span>
                        <span className="block text-xs text-[var(--color-ink-muted)]">
                          {REGISTRATION_STATUS_LABELS[row.status]}
                        </span>
                      </span>
                    </span>
                  </TableCell>
                  <TableCell label="Division" className="sm:whitespace-nowrap">
                    {row.divisionName}
                  </TableCell>
                  <TableCell label="Paid / entry" className="sm:whitespace-nowrap">
                    <strong className="text-[var(--color-plum)]">
                      {formatCents(row.payment.amountPaidCents)}
                    </strong>
                    <span className="text-[var(--color-ink-muted)]">
                      {' '}
                      / {formatCents(row.payment.amountCents)}
                    </span>
                  </TableCell>
                  <TableCell label="Method &amp; reference">
                    <span className="text-left">
                      <span className="block">
                        {row.payment.method ? PAYMENT_METHOD_LABELS[row.payment.method] : '—'}
                      </span>
                      {row.payment.reference ? (
                        <span className="block text-xs text-[var(--color-ink-muted)]">
                          {row.payment.reference}
                        </span>
                      ) : null}
                    </span>
                  </TableCell>
                  <TableCell label="Status">
                    <Badge status={paymentBadge(status)}>{PAYMENT_STATUS_LABELS[status]}</Badge>
                  </TableCell>
                  <TableCell label="Record" className="sm:whitespace-nowrap sm:text-right">
                    <span className="flex flex-wrap justify-end gap-1.5 sm:flex-nowrap">
                      <Button
                        type="button"
                        size="sm"
                        variant="primary"
                        disabled={pending || status === 'paid'}
                        onClick={() =>
                          save(
                            {
                              row,
                              amountText: '',
                              method: row.payment.method ?? 'cash',
                              reference: row.payment.reference ?? '',
                            },
                            row.payment.amountCents,
                          )
                        }
                      >
                        Mark paid
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        disabled={pending}
                        onClick={() => openDraft(row)}
                      >
                        Edit
                      </Button>
                    </span>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      )}

      <Modal
        open={draft !== null}
        onClose={() => setDraft(null)}
        title={draft ? `Record payment — ${draft.row.playerName}` : 'Record payment'}
        description={
          draft
            ? `Entry fee ${formatCents(draft.row.payment.amountCents)} · ${draft.row.divisionName}`
            : undefined
        }
      >
        {draft && (
          <form
            className="flex flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault()
              save(draft)
            }}
          >
            <div>
              <label
                htmlFor="pay-amount"
                className="mb-1 block text-xs font-bold uppercase tracking-wide text-[var(--color-ink-muted)]"
              >
                Amount paid (AUD)
              </label>
              <input
                id="pay-amount"
                inputMode="decimal"
                value={draft.amountText}
                onChange={(event) => setDraft({ ...draft, amountText: event.target.value })}
                className="w-full rounded-[var(--radius-md)] border border-[var(--color-brand-lilac-light)] bg-white px-3.5 py-2.5 text-[var(--color-plum)]"
              />
              <div className="mt-2 flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setDraft({ ...draft, amountText: '0.00' })}
                >
                  Unpaid
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    setDraft({
                      ...draft,
                      amountText: (draft.row.payment.amountCents / 200).toFixed(2),
                    })
                  }
                >
                  Half
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    setDraft({
                      ...draft,
                      amountText: (draft.row.payment.amountCents / 100).toFixed(2),
                    })
                  }
                >
                  Full
                </Button>
              </div>
            </div>

            <div>
              <label
                htmlFor="pay-method"
                className="mb-1 block text-xs font-bold uppercase tracking-wide text-[var(--color-ink-muted)]"
              >
                Method
              </label>
              <select
                id="pay-method"
                value={draft.method}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    method: event.target.value as PaymentMethod | '',
                  })
                }
                className="w-full rounded-[var(--radius-md)] border border-[var(--color-brand-lilac-light)] bg-white px-3.5 py-2.5 text-[var(--color-plum)]"
              >
                <option value="">Not recorded</option>
                {PAYMENT_METHODS.map((method) => (
                  <option key={method} value={method}>
                    {PAYMENT_METHOD_LABELS[method]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="pay-reference"
                className="mb-1 block text-xs font-bold uppercase tracking-wide text-[var(--color-ink-muted)]"
              >
                Note / reference
              </label>
              <input
                id="pay-reference"
                value={draft.reference}
                onChange={(event) => setDraft({ ...draft, reference: event.target.value })}
                placeholder="e.g. Envelope 12, or bank ref SS-0042"
                className="w-full rounded-[var(--radius-md)] border border-[var(--color-brand-lilac-light)] bg-white px-3.5 py-2.5 text-[var(--color-plum)]"
              />
            </div>

            <div className="mt-1 flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setDraft(null)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" loading={pending}>
                Save payment
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </>
  )
}
