import { describe, expect, it } from 'vitest'
import {
  allowedRegistrationTransitions,
  buildAlerts,
  canTransitionRegistration,
  capacityState,
  clampPaidAmount,
  computeReconciliation,
  countByStatus,
  csvEscape,
  csvFilename,
  DEFAULT_ENTRY_FEE_CENTS,
  derivePaymentStatus,
  filterRegistrations,
  formatAdminDate,
  formatCents,
  freeAgents,
  initials,
  matchesSearch,
  parseAmountToCents,
  paymentAuditEntry,
  planBulkTransition,
  registrationAuditEntry,
  REGISTRATIONS_CSV_HEADERS,
  summariseByDivision,
  toRegistrationsCsv,
  type AdminDivision,
  type AdminRegistration,
} from './admin'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const DIVISIONS: AdminDivision[] = [
  { id: 'mens', name: "Men's Doubles", gender: 'mens', maxTeams: 12 },
  { id: 'womens', name: "Women's Doubles", gender: 'womens', maxTeams: 12 },
]

type RegOverrides = Partial<Omit<AdminRegistration, 'payment'>> & {
  id: string
  payment?: Partial<AdminRegistration['payment']>
}

function reg(overrides: RegOverrides): AdminRegistration {
  return {
    playerId: `p-${overrides.id}`,
    playerName: 'Amy Chen',
    nickname: null,
    email: 'amy@example.com',
    phone: '0400 111 222',
    emergencyContactName: 'Bree Walsh',
    emergencyContactPhone: '0400 333 444',
    skillLevel: 'intermediate',
    divisionId: 'womens',
    divisionName: "Women's Doubles",
    status: 'pending',
    teamId: null,
    teamName: null,
    partnerName: null,
    notes: null,
    createdAt: '2026-09-10T02:00:00.000Z',
    ...overrides,
    payment: {
      id: `pay-${overrides.id}`,
      amountCents: DEFAULT_ENTRY_FEE_CENTS,
      amountPaidCents: 0,
      status: 'unpaid',
      method: null,
      reference: null,
      ...overrides.payment,
    },
  }
}

// ---------------------------------------------------------------------------

describe('status transitions', () => {
  it('never offers a transition to the current status', () => {
    for (const from of ['pending', 'approved', 'waitlisted', 'rejected'] as const) {
      expect(allowedRegistrationTransitions(from)).not.toContain(from)
    }
  })

  it('allows revising any decision', () => {
    expect(canTransitionRegistration('pending', 'approved')).toBe(true)
    expect(canTransitionRegistration('rejected', 'approved')).toBe(true)
    expect(canTransitionRegistration('approved', 'waitlisted')).toBe(true)
  })

  it('rejects no-op transitions', () => {
    expect(canTransitionRegistration('approved', 'approved')).toBe(false)
  })

  it('splits a bulk selection into eligible and skipped', () => {
    const rows = [
      reg({ id: '1', status: 'pending' }),
      reg({ id: '2', status: 'approved' }),
      reg({ id: '3', status: 'waitlisted' }),
    ]
    const { eligible, skipped } = planBulkTransition(rows, 'approved')
    expect(eligible.map((r) => r.id)).toEqual(['1', '3'])
    expect(skipped.map((r) => r.id)).toEqual(['2'])
  })
})

describe('derivePaymentStatus', () => {
  it('reports unpaid, partial and paid', () => {
    expect(derivePaymentStatus(0, 2500)).toBe('unpaid')
    expect(derivePaymentStatus(1000, 2500)).toBe('partial')
    expect(derivePaymentStatus(2500, 2500)).toBe('paid')
  })

  it('treats overpayment as paid', () => {
    expect(derivePaymentStatus(3000, 2500)).toBe('paid')
  })

  it('treats a comped (zero-fee) entry as paid', () => {
    expect(derivePaymentStatus(0, 0)).toBe('paid')
  })

  it('ignores negative noise', () => {
    expect(derivePaymentStatus(-500, 2500)).toBe('unpaid')
  })
})

describe('amount helpers', () => {
  it('clamps into the DB-allowed range', () => {
    expect(clampPaidAmount(9999, 2500)).toBe(2500)
    expect(clampPaidAmount(-40, 2500)).toBe(0)
    expect(clampPaidAmount(Number.NaN, 2500)).toBe(0)
  })

  it('parses dollar input to cents', () => {
    expect(parseAmountToCents('$25')).toBe(2500)
    expect(parseAmountToCents('12.50')).toBe(1250)
    expect(parseAmountToCents('1,234.56')).toBe(123456)
    expect(parseAmountToCents('')).toBeNull()
    expect(parseAmountToCents('abc')).toBeNull()
    expect(parseAmountToCents('1.234')).toBeNull()
  })

  it('formats cents as AUD', () => {
    expect(formatCents(2500)).toBe('$25.00')
    expect(formatCents(0)).toBe('$0.00')
    expect(formatCents(123456)).toBe('$1,234.56')
    expect(formatCents(-500)).toBe('-$5.00')
  })
})

describe('computeReconciliation', () => {
  const rows = [
    reg({ id: '1', status: 'approved', payment: { amountPaidCents: 2500, method: 'cash' } }),
    reg({ id: '2', status: 'approved', payment: { amountPaidCents: 1000, method: 'card' } }),
    reg({ id: '3', status: 'pending' }),
    reg({
      id: '4',
      status: 'rejected',
      payment: { amountPaidCents: 2500, method: 'bank_transfer' },
    }),
  ]

  it('excludes rejected rows from expected but keeps their money as collected', () => {
    const totals = computeReconciliation(rows)
    expect(totals.count).toBe(3)
    expect(totals.expectedCents).toBe(7500)
    expect(totals.collectedCents).toBe(6000)
    expect(totals.outstandingCents).toBe(1500)
  })

  it('counts payment statuses and methods', () => {
    const totals = computeReconciliation(rows)
    expect(totals.byStatus).toEqual({ paid: 1, partial: 1, unpaid: 1 })
    expect(totals.byMethodCents.cash).toBe(2500)
    expect(totals.byMethodCents.card).toBe(1000)
    expect(totals.byMethodCents.bank_transfer).toBe(2500)
    expect(totals.byMethodCents.other).toBe(0)
  })

  it('never reports negative outstanding', () => {
    const totals = computeReconciliation([
      reg({ id: 'x', status: 'approved', payment: { amountPaidCents: 2500 } }),
    ])
    expect(totals.outstandingCents).toBe(0)
    expect(totals.collectionRate).toBe(1)
  })

  it('is a full collection rate when nothing is owed', () => {
    expect(computeReconciliation([]).collectionRate).toBe(1)
    expect(computeReconciliation([]).expectedCents).toBe(0)
  })

  it('attributes unmethodded payments to other', () => {
    const totals = computeReconciliation([
      reg({ id: 'y', status: 'approved', payment: { amountPaidCents: 500 } }),
    ])
    expect(totals.byMethodCents.other).toBe(500)
  })
})

describe('search + filters', () => {
  const rows = [
    reg({ id: '1', playerName: 'Amy Chen', divisionId: 'womens', status: 'approved' }),
    reg({
      id: '2',
      playerName: 'Ben Cole',
      divisionId: 'mens',
      divisionName: "Men's Doubles",
      status: 'pending',
      teamId: 't1',
      teamName: 'Tinsel Titans',
      payment: { amountPaidCents: 2500 },
    }),
    reg({ id: '3', playerName: 'Cleo Manu', divisionId: 'womens', status: 'waitlisted' }),
  ]

  it('matches across name, phone and team', () => {
    expect(matchesSearch(rows[0], 'amy')).toBe(true)
    expect(matchesSearch(rows[0], '0400 111')).toBe(true)
    expect(matchesSearch(rows[1], 'tinsel')).toBe(true)
    expect(matchesSearch(rows[1], 'zzz')).toBe(false)
  })

  it('treats an empty query as match-all', () => {
    expect(matchesSearch(rows[0], '   ')).toBe(true)
  })

  it('filters by division, status and payment', () => {
    expect(filterRegistrations(rows, { divisionId: 'womens' }).map((r) => r.id)).toEqual(['1', '3'])
    expect(filterRegistrations(rows, { status: 'pending' }).map((r) => r.id)).toEqual(['2'])
    expect(filterRegistrations(rows, { paid: 'paid' }).map((r) => r.id)).toEqual(['2'])
    expect(filterRegistrations(rows, { paid: 'outstanding' }).map((r) => r.id)).toEqual(['1', '3'])
  })

  it('filters to free agents', () => {
    expect(filterRegistrations(rows, { freeAgentsOnly: true }).map((r) => r.id)).toEqual(['1', '3'])
  })

  it('combines filters with search', () => {
    expect(
      filterRegistrations(rows, { divisionId: 'womens', search: 'cleo' }).map((r) => r.id)
    ).toEqual(['3'])
  })

  it('lists free agents that are pending or approved only', () => {
    expect(freeAgents(rows).map((r) => r.id)).toEqual(['1'])
  })
})

describe('summaries + capacity', () => {
  const rows = [
    ...Array.from({ length: 20 }, (_, i) =>
      reg({ id: `m${i}`, divisionId: 'mens', divisionName: "Men's Doubles", status: 'approved' })
    ),
    reg({ id: 'w1', divisionId: 'womens', status: 'pending' }),
    reg({ id: 'w2', divisionId: 'womens', status: 'rejected' }),
  ]

  it('counts by division and status', () => {
    const [mens, womens] = summariseByDivision(rows, DIVISIONS)
    expect(mens.total).toBe(20)
    expect(mens.byStatus.approved).toBe(20)
    expect(mens.approvedTeams).toBe(10)
    expect(mens.fillRatio).toBeCloseTo(10 / 12)
    expect(womens.total).toBe(2)
    expect(womens.byStatus.rejected).toBe(1)
  })

  it('counts overall status totals', () => {
    expect(countByStatus(rows)).toEqual({ approved: 20, pending: 1, waitlisted: 0, rejected: 1 })
  })

  it('bands capacity', () => {
    expect(capacityState(0, 12)).toBe('open')
    expect(capacityState(6, 12)).toBe('filling')
    expect(capacityState(11, 12)).toBe('near-full')
    expect(capacityState(12, 12)).toBe('full')
    expect(capacityState(13, 12)).toBe('over')
    expect(capacityState(99, null)).toBe('open')
  })
})

describe('buildAlerts', () => {
  it('flags approved players who still owe money', () => {
    const alerts = buildAlerts(
      [reg({ id: '1', status: 'approved' })],
      DIVISIONS
    )
    const alert = alerts.find((a) => a.id === 'unpaid-approved')
    expect(alert?.tone).toBe('danger')
    expect(alert?.detail).toContain('$25.00')
  })

  it('flags a full division', () => {
    const rows = Array.from({ length: 24 }, (_, i) =>
      reg({ id: `m${i}`, divisionId: 'mens', status: 'approved', payment: { amountPaidCents: 2500 } })
    )
    const alert = buildAlerts(rows, DIVISIONS).find((a) => a.id === 'capacity-mens')
    expect(alert?.title).toContain('full')
  })

  it('flags pending invites', () => {
    expect(buildAlerts([], DIVISIONS, 3).some((a) => a.id === 'pending-invites')).toBe(true)
  })

  it('returns a friendly all-clear when there is nothing to do', () => {
    const alerts = buildAlerts([], DIVISIONS)
    expect(alerts).toHaveLength(1)
    expect(alerts[0].tone).toBe('success')
  })
})

describe('CSV export', () => {
  it('escapes quotes, commas and newlines', () => {
    expect(csvEscape('plain')).toBe('plain')
    expect(csvEscape('a,b')).toBe('"a,b"')
    expect(csvEscape('say "hi"')).toBe('"say ""hi"""')
    expect(csvEscape('line\nbreak')).toBe('"line\nbreak"')
    expect(csvEscape(null)).toBe('')
  })

  it('defuses spreadsheet formula injection', () => {
    expect(csvEscape('=SUM(A1:A9)')).toBe("'=SUM(A1:A9)")
    expect(csvEscape('+1')).toBe("'+1")
  })

  it('serialises a header row plus one row per registration', () => {
    const csv = toRegistrationsCsv([
      reg({ id: '1', playerName: 'Amy Chen', payment: { amountPaidCents: 1000 } }),
    ])
    const lines = csv.trimEnd().split('\r\n')
    expect(lines[0]).toBe(REGISTRATIONS_CSV_HEADERS.join(','))
    expect(lines).toHaveLength(2)
    expect(lines[1]).toContain('Amy Chen')
    expect(lines[1]).toContain('Partial')
    expect(lines[1]).toContain('25.00')
    expect(lines[1]).toContain('10.00')
    // Skill level rides along so the draw can be sanity-checked in a spreadsheet.
    expect(lines[1].split(',')).toContain('intermediate')
  })

  it('ends with a trailing CRLF', () => {
    expect(toRegistrationsCsv([]).endsWith('\r\n')).toBe(true)
  })

  it('builds a dated filename', () => {
    expect(csvFilename('registrations', '2026-12-13T00:00:00.000Z')).toBe(
      'sunday-smashers-registrations-2026-12-13.csv'
    )
  })
})

describe('audit entries', () => {
  it('describes a registration status change', () => {
    const row = reg({ id: 'r1', status: 'pending' })
    const entry = registrationAuditEntry(row, 'approved')
    expect(entry.action).toBe('registration.approved')
    expect(entry.entity_type).toBe('registration')
    expect(entry.entity_id).toBe('r1')
    expect(entry.metadata.from).toBe('pending')
    expect(entry.metadata.to).toBe('approved')
  })

  it('describes a payment change', () => {
    const row = reg({ id: 'r2' })
    const entry = paymentAuditEntry(row, {
      amountPaidCents: 2500,
      status: 'paid',
      method: 'cash',
      reference: 'envelope 4',
    })
    expect(entry.action).toBe('payment.paid')
    expect(entry.entity_type).toBe('payment')
    expect(entry.metadata.registration_id).toBe('r2')
    expect(entry.metadata.to_paid_cents).toBe(2500)
    expect(entry.metadata.method).toBe('cash')
  })
})

describe('formatting', () => {
  it('formats dates deterministically', () => {
    expect(formatAdminDate('2026-12-13T00:00:00.000Z')).toBe('13 Dec 2026')
    expect(formatAdminDate('not-a-date')).toBe('—')
  })

  it('derives initials', () => {
    expect(initials('Amy Chen')).toBe('AC')
    expect(initials('Prince')).toBe('PR')
    expect(initials('  Mary Jane Watson ')).toBe('MW')
    expect(initials('')).toBe('?')
  })
})
