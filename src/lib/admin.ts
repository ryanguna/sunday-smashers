/**
 * Pure, dependency-free logic for the admin console (registrations,
 * payments, reconciliation, CSV export, capacity + alerting).
 *
 * Nothing in this file touches Supabase, React or `next/*` — every function
 * is a plain data transform so it can be unit tested in `admin.test.ts` and
 * reused from both Server Components and Client Components.
 *
 * PRIVACY: `AdminRegistration` deliberately carries admin-only PII (email,
 * phone, emergency contact). It must only ever be constructed and rendered
 * behind `requireAdmin()`; never pass these objects into a public component.
 */

import type {
  DivisionGender,
  PaymentStatus,
  RegistrationStatus,
} from '@/lib/supabase/types'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Per-player entry fee in cents. The committee had not published a fee at
 * the time of writing, so $25.00 is assumed — change this single constant
 * (or, once tournament settings exist, read it from the settings row) and
 * every total, badge and reconciliation figure follows.
 */
export const DEFAULT_ENTRY_FEE_CENTS = 2500

export const REGISTRATION_STATUSES = [
  'pending',
  'approved',
  'waitlisted',
  'rejected',
] as const satisfies readonly RegistrationStatus[]

export const PAYMENT_STATUSES = ['unpaid', 'partial', 'paid'] as const satisfies readonly PaymentStatus[]

export const PAYMENT_METHODS = ['cash', 'bank_transfer', 'card', 'other'] as const

export type PaymentMethod = (typeof PAYMENT_METHODS)[number]

export const REGISTRATION_STATUS_LABELS: Record<RegistrationStatus, string> = {
  pending: 'Pending',
  approved: 'Approved',
  waitlisted: 'Waitlisted',
  rejected: 'Rejected',
}

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  unpaid: 'Unpaid',
  partial: 'Partial',
  paid: 'Paid',
}

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'Cash',
  bank_transfer: 'Bank transfer',
  card: 'Card',
  other: 'Other',
}

/** Festive one-liners keyed by status, used as microcopy in the console. */
export const REGISTRATION_STATUS_CHEER: Record<RegistrationStatus, string> = {
  pending: 'Still in the sorting hat 🎩',
  approved: 'On the nice list ✨',
  waitlisted: 'Warming up by the fire 🔥',
  rejected: 'Not this Christmas 🎄',
}

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------

export interface AdminDivision {
  id: string
  name: string
  gender: DivisionGender
  /** Maximum number of *teams*; `null` means uncapped. */
  maxTeams: number | null
}

export interface AdminPaymentInfo {
  /** `null` when no `payments` row exists yet for this registration. */
  id: string | null
  amountCents: number
  amountPaidCents: number
  status: PaymentStatus
  method: PaymentMethod | null
  /** Free-text note / bank reference (the `payments.reference` column). */
  reference: string | null
}

export interface AdminRegistration {
  id: string
  playerId: string
  playerName: string
  nickname: string | null
  /** Admin-only. */
  email: string | null
  /** Admin-only. */
  phone: string | null
  /** Admin-only. */
  emergencyContactName: string | null
  /** Admin-only. */
  emergencyContactPhone: string | null
  skillLevel: string | null
  divisionId: string
  divisionName: string
  status: RegistrationStatus
  teamId: string | null
  teamName: string | null
  partnerName: string | null
  notes: string | null
  createdAt: string
  payment: AdminPaymentInfo
}

// ---------------------------------------------------------------------------
// Status transitions
// ---------------------------------------------------------------------------

/**
 * Which statuses an admin may move a registration to from its current one.
 * A registration can always be re-opened to `pending`, and any non-terminal
 * decision can be revised — but moving to the *same* status is a no-op and
 * is therefore not offered.
 */
const TRANSITIONS: Record<RegistrationStatus, readonly RegistrationStatus[]> = {
  pending: ['approved', 'waitlisted', 'rejected'],
  approved: ['waitlisted', 'rejected', 'pending'],
  waitlisted: ['approved', 'rejected', 'pending'],
  rejected: ['approved', 'waitlisted', 'pending'],
}

export function allowedRegistrationTransitions(
  from: RegistrationStatus
): readonly RegistrationStatus[] {
  return TRANSITIONS[from] ?? []
}

export function canTransitionRegistration(
  from: RegistrationStatus,
  to: RegistrationStatus
): boolean {
  return allowedRegistrationTransitions(from).includes(to)
}

/**
 * Filters a bulk selection down to the rows that can actually make the
 * requested transition, so the UI can report "3 updated, 1 already approved"
 * instead of firing pointless writes.
 */
export function planBulkTransition(
  rows: readonly AdminRegistration[],
  to: RegistrationStatus
): { eligible: AdminRegistration[]; skipped: AdminRegistration[] } {
  const eligible: AdminRegistration[] = []
  const skipped: AdminRegistration[] = []
  for (const row of rows) {
    if (canTransitionRegistration(row.status, to)) eligible.push(row)
    else skipped.push(row)
  }
  return { eligible, skipped }
}

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------

/**
 * Derives the payment status from the amounts, so the badge can never
 * disagree with the numbers. Overpayments count as `paid`; a zero-value
 * entry (comped player) is `paid` as soon as nothing is owed.
 */
export function derivePaymentStatus(amountPaidCents: number, amountCents: number): PaymentStatus {
  const paid = Math.max(0, Math.round(amountPaidCents))
  const owed = Math.max(0, Math.round(amountCents))
  if (paid <= 0) return owed === 0 ? 'paid' : 'unpaid'
  if (paid >= owed) return 'paid'
  return 'partial'
}

/** Clamps a proposed payment amount into the range the DB check constraints allow. */
export function clampPaidAmount(amountPaidCents: number, amountCents: number): number {
  if (!Number.isFinite(amountPaidCents)) return 0
  return Math.min(Math.max(0, Math.round(amountPaidCents)), Math.max(0, Math.round(amountCents)))
}

/** Converts a `$12.50`-style user input into cents. Returns `null` when unparseable. */
export function parseAmountToCents(input: string): number | null {
  const cleaned = input.replace(/[$,\s]/g, '')
  if (cleaned === '') return null
  if (!/^-?\d*(\.\d{0,2})?$/.test(cleaned)) return null
  const value = Number(cleaned)
  if (!Number.isFinite(value) || value < 0) return null
  return Math.round(value * 100)
}

export function formatCents(cents: number): string {
  const sign = cents < 0 ? '-' : ''
  const abs = Math.abs(Math.round(cents))
  return `${sign}$${(abs / 100).toLocaleString('en-AU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

export interface ReconciliationTotals {
  /** Number of registrations counted (rejected ones are excluded). */
  count: number
  expectedCents: number
  collectedCents: number
  outstandingCents: number
  /** How many registrations sit in each payment status. */
  byStatus: Record<PaymentStatus, number>
  /** Cash collected per method (registrations with no method land in `other`). */
  byMethodCents: Record<PaymentMethod, number>
  /** 0–1, `collected / expected`. `1` when nothing is owed. */
  collectionRate: number
}

function emptyMethodTotals(): Record<PaymentMethod, number> {
  return { cash: 0, bank_transfer: 0, card: 0, other: 0 }
}

/**
 * Reconciliation across a set of registrations. Rejected registrations are
 * excluded from "expected" (we don't chase money from people who aren't
 * playing) but any money they *did* pay is still counted as collected, so
 * the admin can see there's a refund to make.
 */
export function computeReconciliation(rows: readonly AdminRegistration[]): ReconciliationTotals {
  const byStatus: Record<PaymentStatus, number> = { unpaid: 0, partial: 0, paid: 0 }
  const byMethodCents = emptyMethodTotals()
  let expectedCents = 0
  let collectedCents = 0
  let count = 0

  for (const row of rows) {
    const { amountCents, amountPaidCents, method } = row.payment
    collectedCents += amountPaidCents
    if (amountPaidCents > 0) byMethodCents[method ?? 'other'] += amountPaidCents
    if (row.status === 'rejected') continue
    count += 1
    expectedCents += amountCents
    byStatus[derivePaymentStatus(amountPaidCents, amountCents)] += 1
  }

  return {
    count,
    expectedCents,
    collectedCents,
    outstandingCents: Math.max(0, expectedCents - collectedCents),
    byStatus,
    byMethodCents,
    collectionRate: expectedCents === 0 ? 1 : collectedCents / expectedCents,
  }
}

// ---------------------------------------------------------------------------
// Search + filters
// ---------------------------------------------------------------------------

export type PaidFilter = 'all' | PaymentStatus | 'outstanding'

export interface RegistrationFilters {
  search?: string
  divisionId?: string | 'all'
  status?: RegistrationStatus | 'all'
  paid?: PaidFilter
  /** When true, only rows with no team assigned (free agents). */
  freeAgentsOnly?: boolean
}

export const EMPTY_FILTERS: RegistrationFilters = {
  search: '',
  divisionId: 'all',
  status: 'all',
  paid: 'all',
  freeAgentsOnly: false,
}

function norm(value: string | null | undefined): string {
  return (value ?? '').toLowerCase()
}

/**
 * Case-insensitive substring match across the fields an admin would
 * plausibly type into the search box — including the admin-only contact
 * fields, since "who is 0400 123 456?" is a real sideline question.
 */
export function matchesSearch(row: AdminRegistration, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return [
    row.playerName,
    row.nickname,
    row.email,
    row.phone,
    row.teamName,
    row.partnerName,
    row.divisionName,
    row.notes,
    row.skillLevel,
  ].some((field) => norm(field).includes(q))
}

function matchesPaidFilter(row: AdminRegistration, filter: PaidFilter): boolean {
  if (filter === 'all') return true
  const status = derivePaymentStatus(row.payment.amountPaidCents, row.payment.amountCents)
  if (filter === 'outstanding') return status !== 'paid'
  return status === filter
}

export function filterRegistrations(
  rows: readonly AdminRegistration[],
  filters: RegistrationFilters
): AdminRegistration[] {
  const { search = '', divisionId = 'all', status = 'all', paid = 'all', freeAgentsOnly = false } =
    filters
  return rows.filter((row) => {
    if (divisionId !== 'all' && row.divisionId !== divisionId) return false
    if (status !== 'all' && row.status !== status) return false
    if (!matchesPaidFilter(row, paid)) return false
    if (freeAgentsOnly && row.teamId) return false
    return matchesSearch(row, search)
  })
}

/** Approved/pending players who don't have a partner yet — the pairing queue. */
export function freeAgents(rows: readonly AdminRegistration[]): AdminRegistration[] {
  return rows.filter((row) => !row.teamId && (row.status === 'approved' || row.status === 'pending'))
}

// ---------------------------------------------------------------------------
// Summaries, capacity + alerts
// ---------------------------------------------------------------------------

export interface DivisionSummary {
  divisionId: string
  divisionName: string
  total: number
  byStatus: Record<RegistrationStatus, number>
  /** Approved players ÷ 2, floored — how many complete pairs we could field. */
  approvedTeams: number
  maxTeams: number | null
  /** 0–1 fill ratio against `maxTeams`; `null` when the division is uncapped. */
  fillRatio: number | null
}

function emptyStatusCounts(): Record<RegistrationStatus, number> {
  return { pending: 0, approved: 0, waitlisted: 0, rejected: 0 }
}

export function summariseByDivision(
  rows: readonly AdminRegistration[],
  divisions: readonly AdminDivision[]
): DivisionSummary[] {
  return divisions.map((division) => {
    const byStatus = emptyStatusCounts()
    let total = 0
    for (const row of rows) {
      if (row.divisionId !== division.id) continue
      total += 1
      byStatus[row.status] += 1
    }
    const approvedTeams = Math.floor(byStatus.approved / 2)
    return {
      divisionId: division.id,
      divisionName: division.name,
      total,
      byStatus,
      approvedTeams,
      maxTeams: division.maxTeams,
      fillRatio: division.maxTeams && division.maxTeams > 0 ? approvedTeams / division.maxTeams : null,
    }
  })
}

export function countByStatus(rows: readonly AdminRegistration[]): Record<RegistrationStatus, number> {
  const counts = emptyStatusCounts()
  for (const row of rows) counts[row.status] += 1
  return counts
}

export type CapacityState = 'open' | 'filling' | 'near-full' | 'full' | 'over'

/** Capacity banding for a division, used for the dashboard's alert colours. */
export function capacityState(approvedTeams: number, maxTeams: number | null): CapacityState {
  if (!maxTeams || maxTeams <= 0) return 'open'
  const ratio = approvedTeams / maxTeams
  if (ratio > 1) return 'over'
  if (ratio >= 1) return 'full'
  if (ratio >= 0.85) return 'near-full'
  if (ratio >= 0.5) return 'filling'
  return 'open'
}

export type AlertTone = 'info' | 'warn' | 'danger' | 'success'

export interface AdminAlert {
  id: string
  tone: AlertTone
  title: string
  detail: string
  /** Optional deep link into the console with filters pre-applied. */
  href?: string
}

/**
 * The dashboard's "what needs my attention" list, in priority order:
 * a tournament nobody can enter, money owed by approved players, divisions
 * running out of room, the pending review queue and unpaired free agents.
 */
export function buildAlerts(
  rows: readonly AdminRegistration[],
  divisions: readonly AdminDivision[]
): AdminAlert[] {
  const alerts: AdminAlert[] = []

  // Nothing else on this page matters if there is no division to enter:
  // `/register` can only apologise, and it does so quietly enough that the
  // committee would never learn the sign-up link was dead.
  if (divisions.length === 0) {
    alerts.push({
      id: 'no-divisions',
      tone: 'danger',
      title: 'Nobody can register yet',
      detail:
        'This tournament has no divisions, so the sign-up form has nothing to offer. Add Men\u2019s and Women\u2019s Doubles before pre-registration opens.',
      href: '/admin/settings/divisions',
    })
  }

  const unpaidApproved = rows.filter(
    (row) =>
      row.status === 'approved' &&
      derivePaymentStatus(row.payment.amountPaidCents, row.payment.amountCents) !== 'paid'
  )
  if (unpaidApproved.length > 0) {
    const owed = unpaidApproved.reduce(
      (sum, row) => sum + Math.max(0, row.payment.amountCents - row.payment.amountPaidCents),
      0
    )
    alerts.push({
      id: 'unpaid-approved',
      tone: 'danger',
      title: `${unpaidApproved.length} approved ${unpaidApproved.length === 1 ? 'player' : 'players'} still owe money`,
      detail: `${formatCents(owed)} outstanding. Chase them before the loot bags go out.`,
      href: '/admin/payments',
    })
  }

  for (const summary of summariseByDivision(rows, divisions)) {
    const state = capacityState(summary.approvedTeams, summary.maxTeams)
    if (state === 'over' || state === 'full') {
      alerts.push({
        id: `capacity-${summary.divisionId}`,
        tone: state === 'over' ? 'danger' : 'warn',
        title: `${summary.divisionName} is ${state === 'over' ? 'over capacity' : 'full'}`,
        detail: `${summary.approvedTeams} of ${summary.maxTeams} team slots taken. New entries should be waitlisted.`,
        href: `/admin/registrations?division=${encodeURIComponent(summary.divisionId)}`,
      })
    } else if (state === 'near-full') {
      alerts.push({
        id: `capacity-${summary.divisionId}`,
        tone: 'warn',
        title: `${summary.divisionName} is nearly full`,
        detail: `${summary.approvedTeams} of ${summary.maxTeams} team slots taken.`,
        href: `/admin/registrations?division=${encodeURIComponent(summary.divisionId)}`,
      })
    }
  }

  const pending = rows.filter((row) => row.status === 'pending').length
  if (pending > 0) {
    alerts.push({
      id: 'pending-review',
      tone: 'info',
      title: `${pending} ${pending === 1 ? 'registration is' : 'registrations are'} waiting for review`,
      detail: 'Approve, waitlist or reject them to keep the draw on schedule.',
      href: '/admin/registrations?status=pending',
    })
  }

  const agents = freeAgents(rows).length
  if (agents > 0) {
    alerts.push({
      id: 'free-agents',
      tone: 'info',
      title: `${agents} ${agents === 1 ? 'player needs' : 'players need'} a partner`,
      detail: 'Pair them up so the draw can be generated.',
      href: '/admin/registrations?free=1',
    })
  }

  if (alerts.length === 0) {
    alerts.push({
      id: 'all-clear',
      tone: 'success',
      title: 'All clear — nothing needs your attention',
      detail: 'Every registration is reviewed and every entry fee is in. Go have an eggnog. 🥛',
    })
  }

  return alerts
}

// ---------------------------------------------------------------------------
// CSV export
// ---------------------------------------------------------------------------

/**
 * RFC 4180 field escaping. Also defuses spreadsheet formula injection by
 * prefixing a single quote to values starting with `= + - @` — admin
 * exports get opened in Excel and player-supplied notes are untrusted.
 */
export function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return ''
  let str = String(value)
  if (/^[=+\-@\t\r]/.test(str)) str = `'${str}`
  if (/[",\n\r]/.test(str)) return `"${str.replace(/"/g, '""')}"`
  return str
}

export const REGISTRATIONS_CSV_HEADERS = [
  'Player',
  'Nickname',
  'Division',
  'Status',
  'Team',
  'Partner',
  'Skill level',
  'Email',
  'Phone',
  'Emergency contact',
  'Emergency phone',
  'Payment status',
  'Amount due',
  'Amount paid',
  'Payment method',
  'Payment reference',
  'Notes',
  'Registered at',
] as const

/** Serialises registrations (including the admin-only contact columns) to CSV. */
export function toRegistrationsCsv(rows: readonly AdminRegistration[]): string {
  const lines = [REGISTRATIONS_CSV_HEADERS.join(',')]
  for (const row of rows) {
    lines.push(
      [
        row.playerName,
        row.nickname,
        row.divisionName,
        REGISTRATION_STATUS_LABELS[row.status],
        row.teamName,
        row.partnerName,
        row.skillLevel,
        row.email,
        row.phone,
        row.emergencyContactName,
        row.emergencyContactPhone,
        PAYMENT_STATUS_LABELS[derivePaymentStatus(row.payment.amountPaidCents, row.payment.amountCents)],
        (row.payment.amountCents / 100).toFixed(2),
        (row.payment.amountPaidCents / 100).toFixed(2),
        row.payment.method ? PAYMENT_METHOD_LABELS[row.payment.method] : '',
        row.payment.reference,
        row.notes,
        row.createdAt,
      ]
        .map(csvEscape)
        .join(',')
    )
  }
  // Trailing newline so `wc -l` and spreadsheet importers agree on the row count.
  return `${lines.join('\r\n')}\r\n`
}

/** `sunday-smashers-registrations-2026-12-13.csv` */
export function csvFilename(prefix: string, isoDate: string): string {
  return `sunday-smashers-${prefix}-${isoDate.slice(0, 10)}.csv`
}

// ---------------------------------------------------------------------------
// Audit log helpers
// ---------------------------------------------------------------------------

export interface AuditEntry {
  action: string
  entity_type: string
  entity_id: string | null
  metadata: Record<string, string | number | boolean | null>
}

/** Builds the `audit_log` row for a registration status change. */
export function registrationAuditEntry(
  registration: Pick<AdminRegistration, 'id' | 'status' | 'playerName' | 'divisionName'>,
  to: RegistrationStatus
): AuditEntry {
  return {
    action: `registration.${to}`,
    entity_type: 'registration',
    entity_id: registration.id,
    metadata: {
      from: registration.status,
      to,
      player_name: registration.playerName,
      division: registration.divisionName,
    },
  }
}

/** Builds the `audit_log` row for a payment change. */
export function paymentAuditEntry(
  registration: Pick<AdminRegistration, 'id' | 'playerName' | 'payment'>,
  next: { amountPaidCents: number; status: PaymentStatus; method: PaymentMethod | null; reference: string | null }
): AuditEntry {
  return {
    action: `payment.${next.status}`,
    entity_type: 'payment',
    entity_id: registration.payment.id,
    metadata: {
      registration_id: registration.id,
      player_name: registration.playerName,
      from_status: registration.payment.status,
      to_status: next.status,
      from_paid_cents: registration.payment.amountPaidCents,
      to_paid_cents: next.amountPaidCents,
      method: next.method,
      reference: next.reference,
    },
  }
}

// ---------------------------------------------------------------------------
// Misc formatting
// ---------------------------------------------------------------------------

/** Stable, locale-independent date label — safe to render during SSR. */
export function formatAdminDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  const day = date.getUTCDate()
  const month = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ][date.getUTCMonth()]
  return `${day} ${month} ${date.getUTCFullYear()}`
}

/** `Amy Chen` → `AC`, for the avatar bubbles in the table. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
}
