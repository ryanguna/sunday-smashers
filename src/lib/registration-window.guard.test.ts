import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Migration 0015 taught the database about capacity but not about time, and
 * migration 0016 closed the three write-path gaps that were left.
 *
 * All three have the same shape: a rule the application states clearly and the
 * database had no opinion about. The anon key ships in the browser bundle by
 * design, so anyone can talk to PostgREST directly — a rule that lives only in
 * a React component is a rule that does not exist.
 *
 * None of this is reachable from a unit test (it is DDL against a live
 * project), so the invariants are asserted against the migration source, the
 * way `waitlist-status.guard.test.ts` pins 0015.
 */

const migration = readFileSync(
  join(process.cwd(), 'supabase', 'migrations', '0016_write_path_gaps.sql'),
  'utf8',
)

function windowFunction(): string {
  const start = migration.indexOf('create or replace function public.enforce_registration_window')
  expect(start, 'the window trigger function is gone — update this test').toBeGreaterThan(-1)
  const end = migration.indexOf('comment on function', start)
  expect(end).toBeGreaterThan(start)
  return migration.slice(start, end)
}

describe('the registration window is enforced in the database', () => {
  it('runs before insert on registrations', () => {
    expect(migration).toMatch(
      /create trigger enforce_registration_window\s+before insert on public\.registrations/,
    )
  })

  it('refuses an entry submitted before the sheet opens', () => {
    expect(windowFunction()).toMatch(/if now\(\) < opens_at then\s+raise exception/)
  })

  it('refuses an entry submitted after the sheet closes', () => {
    expect(windowFunction()).toMatch(
      /if closes_at is not null and now\(\) > closes_at then\s+raise exception/,
    )
  })

  /**
   * The direction of the organiser's switch is the part that is easy to get
   * backwards, and getting it backwards is worse than the bug being fixed.
   *
   * `applyOrganiserSwitch` in `src/lib/registration.ts` treats
   * `is_registration_open` as an *override* of the calendar: on means "open
   * early", and off while the window is open only pauses the form into
   * waitlist mode — it still accepts submissions. So the trigger must allow an
   * entry when the switch is on OR the clock is inside the window. Requiring
   * both would mean a committee that forgot to tick "Accept entries" silently
   * locked every player out on opening day.
   */
  it('treats the organiser switch as an override, not an extra condition', () => {
    const body = windowFunction()
    // The switch short-circuits to success before either date is consulted.
    expect(body).toMatch(/if switch_on then\s+return new;\s+end if;/)
    // And it is never a reason on its own to refuse.
    expect(body).not.toMatch(/if not switch_on then\s+raise exception/)
  })

  it('agrees with the client-side window helper about which flag decides', () => {
    const helper = readFileSync(join(process.cwd(), 'src', 'lib', 'registration.ts'), 'utf8')
    expect(helper).toContain('isRegistrationOpen')
    expect(windowFunction()).toContain('t.is_registration_open')
  })

  it('exempts admins so the committee can still add a late entry', () => {
    expect(windowFunction()).toMatch(/if public\.is_admin\(\) then\s+return new;/)
  })

  it('reads the window from the division\u2019s own tournament', () => {
    expect(windowFunction()).toMatch(
      /join public\.tournaments t on t\.id = d\.tournament_id\s+where d\.id = new\.division_id/,
    )
  })

  it('leaves a missing division to the foreign keys instead of inventing a verdict', () => {
    expect(windowFunction()).toMatch(/if not found then\s+return new;/)
  })

  it('pins search_path, like every other definer function in this schema', () => {
    expect(windowFunction()).toContain('set search_path = public, pg_temp')
  })

  /**
   * `submitRegistration` prints unrecognised database errors behind "We
   * couldn't save your registration:", which would bury a message that is
   * already written for players. 23514 is this trigger.
   */
  it('raises a code the registration form maps to a readable message', () => {
    expect(windowFunction()).toMatch(/using errcode = 'check_violation'/)
    const form = readFileSync(
      join(process.cwd(), 'src', 'components', 'registration', 'data.ts'),
      'utf8',
    )
    expect(form).toContain("registrationError.code === '23514'")
    expect(form).toMatch(/outsideWindow\s*$/m)
  })
})

describe('a player cannot sign off on their own entry', () => {
  function updatePolicy(): string {
    const start = migration.indexOf(
      'create policy "registrations_update_own_pending_or_admin"',
    )
    expect(start, 'the update policy is gone — update this test').toBeGreaterThan(-1)
    return migration.slice(start, migration.indexOf(';', start))
  }

  it('pins reviewed_by and reviewed_at in the WITH CHECK half', () => {
    // The USING half decides which rows are visible to update; only WITH CHECK
    // constrains what they may be changed *into*. The INSERT policy has
    // carried these two pins since 0009; UPDATE never did, so a player could
    // PATCH their own row and stamp it as reviewed by an organiser who never
    // saw it.
    const check = updatePolicy().slice(updatePolicy().indexOf('with check'))
    expect(check).toContain('reviewed_by is null')
    expect(check).toContain('reviewed_at is null')
  })

  it('keeps the existing status pin so an approved entry stays out of reach', () => {
    expect(updatePolicy()).toMatch(/status = 'pending'/)
  })

  it('replaces the policy under its real name rather than adding a second one', () => {
    // A differently-named policy would be OR-ed with the original, which is
    // permissive — the gap would still be open.
    expect(migration).toContain(
      'drop policy if exists "registrations_update_own_pending_or_admin" on public.registrations',
    )
  })
})

describe('every public table forces row level security', () => {
  it('adds the flag site_page_visibility was missing', () => {
    expect(migration).toContain(
      'alter table public.site_page_visibility force row level security',
    )
  })
})

/**
 * Migration 0017 — `registrations` carries both `division_id` and
 * `tournament_id`, and the two foreign keys are independent, so nothing ever
 * checked that the division belonged to the tournament named beside it.
 *
 * It matters more after 0016: the window trigger reads the dates from the
 * *division's* tournament, so a row could be admitted under one tournament's
 * calendar while recording itself under another. The admin queue filters by
 * `tournament_id`, so that row would be invisible to the committee while
 * still holding its `unique (division_id, player_id)` slot and counting
 * against the cap — an entry nobody can see and nobody can approve, occupying
 * a place. Verified against live: before 0017 the mismatch was stored as
 * written.
 */
describe('a registration cannot name a tournament its division does not belong to', () => {
  const sync = readFileSync(
    join(process.cwd(), 'supabase', 'migrations', '0017_registration_tournament_consistency.sql'),
    'utf8',
  )

  it('derives the tournament from the division rather than trusting the client', () => {
    expect(sync).toContain('new.tournament_id := owning_tournament')
    expect(sync).toMatch(/from public\.divisions\s+where id = new\.division_id/)
  })

  it('corrects rather than refuses, so a stray client value cannot fail an entry', () => {
    // A CHECK constraint here would turn a column the player has never heard
    // of into a failed registration. The value is derived data; the database
    // can just compute it.
    expect(sync).not.toMatch(/raise exception/i)
  })

  it('covers updates too, so moving an entry between divisions stays consistent', () => {
    expect(sync).toMatch(
      /before insert or update of division_id, tournament_id on public\.registrations/,
    )
  })

  it('repairs rows already stored with the wrong pairing', () => {
    expect(sync).toMatch(/update public\.registrations r\s+set tournament_id = d\.tournament_id/)
  })

  it('pins search_path, like every other definer function in this schema', () => {
    expect(sync).toContain('set search_path = public, pg_temp')
  })
})
