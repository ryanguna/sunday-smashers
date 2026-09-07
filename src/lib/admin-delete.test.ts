import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  analysePersonDeletion,
  CONFIRM_WORD,
  planRegistrationDeletion,
} from './admin-delete'
import { sumPaidCents, type AdminRegistration } from './admin'
import type { ManagedUser } from './settings'

const read = (relative: string) => readFileSync(join(process.cwd(), 'src', relative), 'utf8')

function registration(overrides: Partial<AdminRegistration> = {}): AdminRegistration {
  return {
    id: 'reg-1',
    playerId: 'user-1',
    playerName: 'Holly Cruz',
    nickname: null,
    email: 'holly@example.com',
    phone: null,
    emergencyContactName: null,
    emergencyContactPhone: null,
    skillLevel: null,
    divisionId: 'div-1',
    divisionName: 'Women’s Doubles',
    status: 'pending',
    teamId: null,
    teamName: null,
    partnerName: null,
    notes: null,
    createdAt: '2026-09-01T00:00:00.000Z',
    payment: {
      id: null,
      amountCents: 5000,
      amountPaidCents: 0,
      status: 'unpaid',
      method: null,
      reference: null,
    },
    ...overrides,
  }
}

function user(overrides: Partial<ManagedUser> = {}): ManagedUser {
  return { id: 'user-1', fullName: 'Holly Cruz', nickname: null, email: null, roles: [], ...overrides }
}

describe('planRegistrationDeletion', () => {
  it('refuses an empty selection', () => {
    const plan = planRegistrationDeletion([])
    expect(plan.allowed).toBe(false)
    expect(plan.blockedReason).toContain('at least one')
  })

  it('names the player and division for a single entry', () => {
    const plan = planRegistrationDeletion([registration()])
    expect(plan.allowed).toBe(true)
    expect(plan.title).toContain('Holly Cruz')
    expect(plan.effects[0]?.detail).toContain('Women’s Doubles')
  })

  it('says the account survives, because deleting an entry is not deleting a person', () => {
    const plan = planRegistrationDeletion([registration()])
    expect(plan.effects[0]?.detail).toContain('account stays')
  })

  it('warns loudly when money has been taken, since the payment row cascades away', () => {
    const plan = planRegistrationDeletion([
      registration({ payment: { ...registration().payment, amountPaidCents: 5000, status: 'paid' } }),
    ])
    const money = plan.effects.find((effect) => effect.label === 'Payments')
    expect(money?.severe).toBe(true)
    expect(money?.detail).toContain('$50.00')
    expect(money?.detail).toContain('reconciliation')
  })

  it('stays silent about payments when nothing has been paid', () => {
    const plan = planRegistrationDeletion([registration()])
    expect(plan.effects.some((effect) => effect.label === 'Payments')).toBe(false)
  })

  it('totals the money across a bulk delete', () => {
    const plan = planRegistrationDeletion([
      registration({ id: 'a', payment: { ...registration().payment, amountPaidCents: 5000 } }),
      registration({ id: 'b', payment: { ...registration().payment, amountPaidCents: 2500 } }),
    ])
    expect(plan.effects.find((effect) => effect.label === 'Payments')?.detail).toContain('$75.00')
  })

  it('warns that a partner is left stranded when the player is on a team', () => {
    const plan = planRegistrationDeletion([
      registration({ teamId: 'team-1', teamName: 'Tinsel Smashers' }),
    ])
    expect(plan.effects.find((effect) => effect.label === 'Teams')?.detail).toContain(
      'Tinsel Smashers',
    )
  })

  it('points an organiser at reject when the entry was already reviewed', () => {
    const plan = planRegistrationDeletion([registration({ status: 'approved' })])
    expect(plan.effects.find((effect) => effect.label === 'Already reviewed')?.detail).toContain(
      'reject it instead',
    )
  })

  it('does not nag about rejecting when the entry is still pending', () => {
    const plan = planRegistrationDeletion([registration({ status: 'pending' })])
    expect(plan.effects.some((effect) => effect.label === 'Already reviewed')).toBe(false)
  })
})

describe('analysePersonDeletion', () => {
  const admins = [
    user({ id: 'a', fullName: 'Admin One', roles: ['admin'] }),
    user({ id: 'b', fullName: 'Admin Two', roles: ['admin'] }),
  ]

  it('refuses to delete your own account', () => {
    const plan = analysePersonDeletion({ actorUserId: 'a', targetUserId: 'a', users: admins })
    expect(plan.allowed).toBe(false)
    expect(plan.blockedReason).toContain('sign you out')
  })

  it('refuses to delete the last admin, matching the role-revoke rule', () => {
    const plan = analysePersonDeletion({
      actorUserId: 'z',
      targetUserId: 'a',
      users: [user({ id: 'a', fullName: 'Admin One', roles: ['admin'] })],
    })
    expect(plan.allowed).toBe(false)
    expect(plan.blockedReason).toContain('last admin')
  })

  it('allows deleting an admin while another one remains', () => {
    const plan = analysePersonDeletion({ actorUserId: 'b', targetUserId: 'a', users: admins })
    expect(plan.allowed).toBe(true)
  })

  it('refuses when the person is already gone', () => {
    const plan = analysePersonDeletion({ actorUserId: 'a', targetUserId: 'ghost', users: admins })
    expect(plan.allowed).toBe(false)
    expect(plan.blockedReason).toContain('no longer exists')
  })

  it('marks losing the account as severe and says it cannot be undone', () => {
    const plan = analysePersonDeletion({ actorUserId: 'b', targetUserId: 'a', users: admins })
    expect(plan.effects[0]?.severe).toBe(true)
    expect(plan.effects[0]?.detail).toContain('cannot be undone')
  })

  it('lists the entries and the money that go with the account', () => {
    const plan = analysePersonDeletion({
      actorUserId: 'b',
      targetUserId: 'a',
      users: admins,
      registrations: [
        registration({
          playerId: 'a',
          payment: { ...registration().payment, amountPaidCents: 5000 },
        }),
      ],
    })
    expect(plan.effects.some((effect) => effect.detail.includes('Women’s Doubles'))).toBe(true)
    expect(plan.effects.find((effect) => effect.label === 'Payments')?.detail).toContain('$50.00')
  })

  it('ignores registrations belonging to somebody else', () => {
    const plan = analysePersonDeletion({
      actorUserId: 'b',
      targetUserId: 'a',
      users: admins,
      registrations: [registration({ playerId: 'someone-else' })],
    })
    expect(plan.effects.some((effect) => effect.label === 'Their entry')).toBe(false)
  })

  it('lists the roles being given up', () => {
    const plan = analysePersonDeletion({ actorUserId: 'b', targetUserId: 'a', users: admins })
    expect(plan.effects.find((effect) => effect.label === 'Roles')?.detail).toContain('Admin')
  })
})

describe('the delete actions defend themselves', () => {
  const adminActions = read('components/admin/actions.ts')
  const settingsActions = read('app/admin/settings/actions.ts')

  it('re-checks admin server-side before deleting registrations', () => {
    expect(adminActions).toContain('Only admins can delete registrations.')
  })

  it('clears team membership before deleting the entry', () => {
    // `team_members.registration_id` is `on delete set null`, so without this
    // the player stays on a team with no entry and the draw still deals them in.
    const body = adminActions.slice(adminActions.indexOf('deleteRegistrationsAction'))
    const membership = body.indexOf("from('team_members')")
    const entry = body.indexOf("from('registrations').delete()")
    expect(membership).toBeGreaterThan(-1)
    expect(entry).toBeGreaterThan(-1)
    expect(membership).toBeLessThan(entry)
  })

  it('records the amount paid in the audit log, since the payment row cascades away', () => {
    expect(adminActions).toContain('amount_paid_cents')
    expect(adminActions).toContain('registration.deleted')
  })

  it('deletes the auth user rather than the profile row', () => {
    // profiles.id references auth.users ON DELETE CASCADE — one way only.
    // Deleting the profile would leave an account that can still sign in and
    // that `handle_new_user` never restores.
    expect(settingsActions).toContain('admin.auth.admin.deleteUser')
    expect(settingsActions).not.toContain("from('profiles').delete()")
  })

  it('re-checks the block rules server-side instead of trusting the dialog', () => {
    const body = settingsActions.slice(settingsActions.indexOf('deleteUserAction'))
    expect(body).toContain('analysePersonDeletion')
    expect(body).toContain('plan.blockedReason')
  })

  it('writes the audit entry before the account is destroyed', () => {
    const body = settingsActions.slice(settingsActions.indexOf('export async function deleteUserAction'))
    expect(body.indexOf('writeAudit')).toBeLessThan(body.indexOf('admin.auth.admin.deleteUser'))
  })
})

describe('the confirmation dialog is wired to both surfaces', () => {
  it('requires the word typed out before confirming', () => {
    const dialog = read('components/admin/DeleteConfirmDialog.tsx')
    expect(dialog).toContain("typed.trim().toUpperCase() === plan.confirmWord")
    expect(dialog).toContain('disabled={!matches || pending}')
  })

  it('offers no confirm button at all when the plan is blocked', () => {
    const dialog = read('components/admin/DeleteConfirmDialog.tsx')
    expect(dialog).toContain('plan.allowed ? (')
    expect(dialog).toContain('{plan.blockedReason}')
  })

  it('is mounted only while a delete is pending, so the typed word cannot carry over', () => {
    const registrations = read('components/admin/RegistrationsClient.tsx')
    const roles = read('components/settings/RolesManager.tsx')
    expect(registrations).toContain('{deleting.length > 0 && (')
    expect(roles).toContain('{removing && (')
  })

  it('gives registrations both a bulk and a per-row delete', () => {
    const registrations = read('components/admin/RegistrationsClient.tsx')
    expect(registrations).toContain('onClick={() => setDeleting(selectedRows)}')
    expect(registrations).toContain('onClick={() => setDeleting([row])}')
  })

  it('drops deleted rows out of the selection so the bulk bar cannot re-target them', () => {
    const registrations = read('components/admin/RegistrationsClient.tsx')
    expect(registrations).toContain('current.filter((id) => !gone.has(id))')
  })

  it('passes the delete action down to People & roles', () => {
    const page = read('app/admin/settings/roles/page.tsx')
    expect(page).toContain('deleteUser={deleteUserAction}')
  })

  it('keeps a blocked delete button visible with the reason, rather than hiding it', () => {
    const roles = read('components/settings/RolesManager.tsx')
    expect(roles).toContain('disabled={readOnly || !plan.allowed || pending !== null}')
    expect(roles).toContain('plan.blockedReason')
  })

  it('agrees on the confirmation word', () => {
    expect(CONFIRM_WORD).toBe('DELETE')
  })
})

describe('the money trail survives both deletes', () => {
  const settingsActions = read('app/admin/settings/actions.ts')

  it('records what a deleted person had paid, since the cascade destroys payments', () => {
    const body = settingsActions.slice(
      settingsActions.indexOf('export async function deleteUserAction'),
    )
    expect(body).toContain('amount_paid_cents')
    expect(body).toContain('registration_ids')
  })

  it('gives the People & roles dialog the entries it needs to warn about', () => {
    const page = read('app/admin/settings/roles/page.tsx')
    expect(page).toContain('getAdminConsoleData')
    expect(page).toContain('registrations={registrations}')
  })
})

describe('sumPaidCents survives the PostgREST embed shape', () => {
  it('handles the to-one object PostgREST actually returns', () => {
    // `payments.registration_id` is UNIQUE, so the embed is an object or null.
    // Assuming an array crashed a live delete *after* the rows were destroyed.
    expect(sumPaidCents({ amount_paid_cents: 5000 })).toBe(5000)
  })

  it('handles null, which is what an unpaid entry embeds as', () => {
    expect(sumPaidCents(null)).toBe(0)
    expect(sumPaidCents(undefined)).toBe(0)
  })

  it('still handles an array, so dropping the unique constraint cannot break it', () => {
    expect(sumPaidCents([{ amount_paid_cents: 2500 }, { amount_paid_cents: 5000 }])).toBe(7500)
    expect(sumPaidCents([])).toBe(0)
  })

  it('treats a missing or non-numeric amount as nothing paid', () => {
    expect(sumPaidCents({})).toBe(0)
    expect(sumPaidCents({ amount_paid_cents: null })).toBe(0)
  })
})

describe('a delete never destroys the only record of the money', () => {
  const adminActions = read('components/admin/actions.ts')

  it('writes the audit entry before the rows are deleted', () => {
    const body = adminActions.slice(adminActions.indexOf('deleteRegistrationsAction'))
    expect(body.indexOf('writeAuditOrFail')).toBeLessThan(body.indexOf("from('registrations').delete()"))
  })

  it('aborts the delete when the audit entry cannot be written', () => {
    // The fire-and-forget `writeAudit` is wrong here: after the cascade there
    // is nothing else that knows a payment existed.
    expect(adminActions).toContain('so nothing was deleted')
    expect(adminActions).toContain('writeAuditOrFail')
  })

  it('uses the shared normaliser rather than assuming an array', () => {
    expect(adminActions).toContain('sumPaidCents(row.payments)')
    expect(adminActions).not.toContain('(row.payments ?? []).reduce')
    const settingsActions = read('app/admin/settings/actions.ts')
    expect(settingsActions).toContain('sumPaidCents(entry.payments)')
  })
})
