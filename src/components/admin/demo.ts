/**
 * Deterministic demo fixtures for the admin console.
 *
 * Used whenever `isSupabaseConfigured()` is false, so the whole console
 * (dashboard, registrations, payments) is fully reviewable with no database
 * — CI builds and the Playwright smoke run have no env vars at all.
 *
 * Players are drawn from the public demo teams in `@/lib/demo-data` so the
 * admin console tells the same story as `/standings` and `/schedule`, plus a
 * handful of extra unpaired "free agents" and pending entries so the review
 * queue, the pairing queue and the alert list all have something in them.
 *
 * The phone numbers / emergency contacts here are obviously fake, but they
 * exercise the admin-only PII columns so we can check they never leak.
 */

import { getAllDemoBundles } from '@/lib/demo-data'
import { DEFAULT_ENTRY_FEE_CENTS, type AdminDivision, type AdminPartnerInvite, type AdminRegistration, type PaymentMethod } from '@/lib/admin'
import type { PaymentStatus, RegistrationStatus } from '@/lib/supabase/types'

export const DEMO_ADMIN_DIVISIONS: AdminDivision[] = [
  { id: 'mens_doubles', name: "Men's Doubles", gender: 'mens', maxTeams: 12 },
  { id: 'womens_doubles', name: "Women's Doubles", gender: 'womens', maxTeams: 12 },
]

const SHIRT_SIZES = ['S', 'M', 'L', 'XL', 'XXL', 'M', 'L'] as const
const SKILL_LEVELS = ['beginner', 'intermediate', 'advanced', 'open'] as const
const METHODS: (PaymentMethod | null)[] = ['cash', 'bank_transfer', 'card', null]

/** Small deterministic hash so every derived attribute is stable across renders. */
function hash(input: string): number {
  let h = 2166136261
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return Math.abs(h)
}

function slugEmail(name: string): string {
  return `${name.toLowerCase().replace(/[^a-z]+/g, '.')}@smashers.example`
}

function fakePhone(seed: number): string {
  return `04${(seed % 90 + 10).toString()} ${(seed % 900 + 100).toString()} ${((seed >> 3) % 900 + 100).toString()}`
}

function buildRegistration(args: {
  id: string
  playerId: string
  playerName: string
  divisionId: string
  divisionName: string
  status: RegistrationStatus
  teamId: string | null
  teamName: string | null
  partnerName: string | null
  paidCents: number
  method: PaymentMethod | null
  reference: string | null
  notes: string | null
  dayOffset: number
}): AdminRegistration {
  const seed = hash(args.playerName)
  const paymentStatus: PaymentStatus =
    args.paidCents >= DEFAULT_ENTRY_FEE_CENTS ? 'paid' : args.paidCents > 0 ? 'partial' : 'unpaid'
  const created = new Date(Date.UTC(2026, 8, 6 + args.dayOffset, 3, 15)).toISOString()
  return {
    id: args.id,
    playerId: args.playerId,
    playerName: args.playerName,
    nickname: seed % 5 === 0 ? args.playerName.split(' ')[0].slice(0, 3) + 'zy' : null,
    email: slugEmail(args.playerName),
    phone: fakePhone(seed),
    emergencyContactName: seed % 3 === 0 ? null : 'Robin Kirk',
    emergencyContactPhone: seed % 3 === 0 ? null : fakePhone(seed + 7),
    shirtSize: SHIRT_SIZES[seed % SHIRT_SIZES.length],
    skillLevel: SKILL_LEVELS[seed % SKILL_LEVELS.length],
    divisionId: args.divisionId,
    divisionName: args.divisionName,
    status: args.status,
    teamId: args.teamId,
    teamName: args.teamName,
    partnerName: args.partnerName,
    notes: args.notes,
    createdAt: created,
    payment: {
      id: `demo-pay-${args.id}`,
      amountCents: DEFAULT_ENTRY_FEE_CENTS,
      amountPaidCents: args.paidCents,
      status: paymentStatus,
      method: args.method,
      reference: args.reference,
    },
  }
}

function buildDemoRegistrations(): AdminRegistration[] {
  const rows: AdminRegistration[] = []
  let dayOffset = 0

  for (const bundle of getAllDemoBundles()) {
    const divisionId = bundle.division.slug
    const divisionName = bundle.division.name

    bundle.teams.forEach((team, teamIndex) => {
      team.players.forEach((player, playerIndex) => {
        const seed = hash(`${player.id}:${teamIndex}`)
        // Most paired players are approved and paid; a few lag behind so the
        // review queue and the "still owes money" alert are never empty.
        const laggard = teamIndex >= 9
        const status: RegistrationStatus = laggard ? 'waitlisted' : 'approved'
        const paidCents = laggard
          ? 0
          : seed % 11 === 0
            ? 0
            : seed % 7 === 0
              ? 1000
              : DEFAULT_ENTRY_FEE_CENTS
        rows.push(
          buildRegistration({
            id: `demo-reg-${player.id}`,
            playerId: player.id,
            playerName: player.name,
            divisionId,
            divisionName,
            status,
            teamId: team.id,
            teamName: team.name,
            partnerName: team.players[playerIndex === 0 ? 1 : 0]?.name ?? null,
            paidCents,
            method: paidCents > 0 ? METHODS[seed % METHODS.length] ?? 'cash' : null,
            reference: paidCents > 0 && seed % 4 === 0 ? `Envelope ${((seed % 40) + 1).toString()}` : null,
            notes: teamIndex === 10 && playerIndex === 0 ? 'Arriving late — soccer final in the morning.' : null,
            dayOffset: dayOffset % 40,
          })
        )
        dayOffset += 1
      })
    })
  }

  // Free agents: signed up solo, still waiting for a partner.
  const freeAgentNames: [string, string][] = [
    ['Rangi Waaka', 'mens_doubles'],
    ['Sam Okafor', 'mens_doubles'],
    ['Theo Lindqvist', 'mens_doubles'],
    ['Willow Nguyen', 'womens_doubles'],
    ['Xanthe Brooks', 'womens_doubles'],
  ]
  freeAgentNames.forEach(([name, divisionId], index) => {
    const division = DEMO_ADMIN_DIVISIONS.find((d) => d.id === divisionId)!
    rows.push(
      buildRegistration({
        id: `demo-reg-free-${index}`,
        playerId: `free-${index}`,
        playerName: name,
        divisionId: division.id,
        divisionName: division.name,
        status: index % 2 === 0 ? 'pending' : 'approved',
        teamId: null,
        teamName: null,
        partnerName: null,
        paidCents: index === 1 ? DEFAULT_ENTRY_FEE_CENTS : index === 3 ? 1500 : 0,
        method: index === 1 ? 'bank_transfer' : index === 3 ? 'cash' : null,
        reference: index === 1 ? 'SS-FREE-02' : null,
        notes: 'Looking for a partner — happy with anyone!',
        dayOffset: 30 + index,
      })
    )
  })

  // A couple of decisions already made the other way, so every status band
  // and every filter has at least one row behind it.
  rows.push(
    buildRegistration({
      id: 'demo-reg-rejected-1',
      playerId: 'rejected-1',
      playerName: 'Yusuf Demir',
      divisionId: 'mens_doubles',
      divisionName: "Men's Doubles",
      status: 'rejected',
      teamId: null,
      teamName: null,
      partnerName: null,
      paidCents: 0,
      method: null,
      reference: null,
      notes: 'Duplicate entry — already registered under another email.',
      dayOffset: 36,
    }),
    buildRegistration({
      id: 'demo-reg-pending-1',
      playerId: 'pending-1',
      playerName: 'Zara Ihaka',
      divisionId: 'womens_doubles',
      divisionName: "Women's Doubles",
      status: 'pending',
      teamId: null,
      teamName: null,
      partnerName: null,
      paidCents: 0,
      method: null,
      reference: null,
      notes: null,
      dayOffset: 38,
    })
  )

  return rows
}

export const DEMO_ADMIN_REGISTRATIONS: AdminRegistration[] = buildDemoRegistrations()

export const DEMO_ADMIN_INVITES: AdminPartnerInvite[] = [
  {
    id: 'demo-invite-1',
    divisionName: "Men's Doubles",
    inviterName: 'Rangi Waaka',
    inviteeLabel: 'sam.okafor@smashers.example',
    createdAt: '2026-10-02T04:00:00.000Z',
  },
  {
    id: 'demo-invite-2',
    divisionName: "Women's Doubles",
    inviterName: 'Willow Nguyen',
    inviteeLabel: 'Xanthe Brooks',
    createdAt: '2026-10-05T04:00:00.000Z',
  },
  {
    id: 'demo-invite-3',
    divisionName: "Women's Doubles",
    inviterName: 'Zara Ihaka',
    inviteeLabel: 'a.friend@smashers.example',
    createdAt: '2026-10-09T04:00:00.000Z',
  },
]
