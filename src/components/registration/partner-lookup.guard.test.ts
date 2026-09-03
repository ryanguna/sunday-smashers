import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { describePartnerWarning, escapeLikePattern, parsePartnerIdentifier } from '@/lib/registration'

/**
 * Guards the partner-invite lookup.
 *
 * The defect this file exists for: `resolveHandle` queried `public.profiles`
 * to turn a `@handle` into a player id. `profiles` is owner-or-admin under RLS
 * (`profiles_select_own`, migration 0001), so for every ordinary player the
 * query returned no row, `inviteeId` stayed null, the `if (inviteeId ||
 * inviteeEmail)` guard failed, and **no `partner_invites` row was ever
 * created**. There was no error and no message — the player was shown the
 * success screen and the named partner was never told anything.
 *
 * It cannot be caught by a unit test of the function (it needs a real database
 * with RLS on) and it cannot be caught by the RLS suite (that tests SQL, not
 * which table the app chose to ask). So the guard is structural: the
 * registration data layer must use the view that exists for this lookup.
 */
const DATA_SOURCE = readFileSync(join(process.cwd(), 'src/components/registration/data.ts'), 'utf8')

describe('partner handle lookup', () => {
  it('resolves handles through player_directory, never through profiles', () => {
    // `player_directory` (migrations 0002/0009) whitelists non-sensitive
    // columns and is granted to `authenticated` precisely so one player can
    // look another up.
    expect(DATA_SOURCE).toContain("from('player_directory')")
  })

  it('never looks another player up by nickname in the owner-only profiles table', () => {
    // Reading your *own* profile (`.eq('id', user.id)`) is fine and the file
    // does it. The defect was specifically the cross-player lookup: filtering
    // `profiles` by someone else's nickname, which RLS can never satisfy.
    // So the guard is that every nickname lookup targets the view.
    const lookups = [...DATA_SOURCE.matchAll(/\.ilike\('nickname'/g)]
    expect(lookups.length).toBeGreaterThan(0)

    for (const match of lookups) {
      const preceding = DATA_SOURCE.slice(Math.max(0, match.index - 200), match.index)
      expect(preceding).toContain("from('player_directory')")
      expect(preceding).not.toContain("from('profiles')")
    }
  })

  it('asks for two rows so a duplicate handle is detectable', () => {
    // `profiles.nickname` has no unique constraint, so `.maybeSingle()` throws
    // on a collision. Fetching two rows tells ambiguity from a clean hit.
    expect(DATA_SOURCE).toContain('.limit(2)')
    expect(DATA_SOURCE).not.toContain('.ilike(\'nickname\', handle)')
  })

  it('surfaces a reason whenever the invite does not go out', () => {
    // The old code was `invitedPartner = !inviteError`, which discarded the
    // error entirely. Every failure branch must now set a warning code.
    for (const code of ['handle-not-found', 'handle-ambiguous', 'lookup-failed', 'invite-failed']) {
      expect(DATA_SOURCE).toContain(`'${code}'`)
    }
  })
})

describe('escapeLikePattern', () => {
  it('escapes the single-character wildcard that handles are allowed to contain', () => {
    // HANDLE_PATTERN permits `_`, which ILIKE reads as "any one character", so
    // `holly_smash` would also match `hollyxsmash`.
    expect(escapeLikePattern('holly_smash')).toBe('holly\\_smash')
  })

  it('escapes the multi-character wildcard', () => {
    expect(escapeLikePattern('holly%')).toBe('holly\\%')
  })

  it('escapes the escape character first so it cannot double-escape', () => {
    expect(escapeLikePattern('a\\b')).toBe('a\\\\b')
  })

  it('leaves an ordinary handle untouched', () => {
    expect(escapeLikePattern('hollysmash')).toBe('hollysmash')
    expect(escapeLikePattern('holly.smash-01')).toBe('holly.smash-01')
  })

  it('keeps every handle the parser accepts safe to match literally', () => {
    const parsed = parsePartnerIdentifier('@holly_smash')
    expect(parsed).toEqual({ kind: 'handle', handle: 'holly_smash' })
    // The parser accepts it, so the lookup has to neutralise it.
    expect(escapeLikePattern(parsed.kind === 'handle' ? parsed.handle : '')).toBe('holly\\_smash')
  })
})

describe('describePartnerWarning', () => {
  it('renders copy for every code the data layer can emit', () => {
    for (const code of ['handle-not-found', 'handle-ambiguous', 'lookup-failed', 'invite-failed']) {
      expect(describePartnerWarning(code)).toBeTruthy()
    }
  })

  it('reassures the player that the entry itself was saved', () => {
    // The entry really did save; only the invite failed. Saying otherwise
    // would send people back to re-register into a unique-constraint wall.
    expect(describePartnerWarning('handle-not-found')).toContain('saved your entry')
  })

  it('ignores anything not on the whitelist', () => {
    // The code travels in the URL, so a hand-edited link must not be able to
    // put arbitrary text on our confirmation screen.
    expect(describePartnerWarning('Call 1-800-SCAM to confirm your spot')).toBeNull()
    expect(describePartnerWarning('')).toBeNull()
    expect(describePartnerWarning(null)).toBeNull()
    expect(describePartnerWarning(undefined)).toBeNull()
  })
})

/**
 * Guards the other half of the pairing flow.
 *
 * `accept_partner_invite` (migration 0009) writes `teams` and both
 * `team_members` rows, but no `registrations` row. An invitee who only ever
 * tapped "accept" was therefore on a team and in the draw while having no
 * emergency contact, no accepted code of conduct, no entry fee the committee
 * could see, and "Not registered yet" on their own dashboard — and the
 * message they were shown, "You're a pair! Your team is off to the committee
 * for approval", told them they were finished.
 */
describe('accepting a partner invite', () => {
  it('checks whether the accepting player has actually registered', () => {
    // The check has to be against `registrations` for that division and that
    // player — team membership is what already existed and is not the answer.
    expect(DATA_SOURCE).toContain("from('registrations')")
    expect(DATA_SOURCE).toMatch(/needsRegistration/)
  })

  it('prompts when a failed read leaves it unknown', () => {
    // Failing closed here means prompting. Sending an already-registered
    // player to a wizard that says so is a much smaller harm than letting an
    // unregistered one believe they are done.
    expect(DATA_SOURCE).toContain('const needsRegistration = registrationError ? true : !existing')
  })

  it('does not tell a half-registered player that they are finished', () => {
    // The unconditional cheerful message was the defect.
    const finished = 'Your team is off to the committee for approval 🎉'
    const index = DATA_SOURCE.indexOf(finished)
    expect(index).toBeGreaterThan(-1)
    // It must now sit on the branch where registration already exists.
    const preceding = DATA_SOURCE.slice(Math.max(0, index - 400), index)
    expect(preceding).toContain('needsRegistration')
  })

  it('offers the way to finish, not just a sentence about it', () => {
    const panel = readFileSync(join(process.cwd(), 'src/components/registration/InvitesPanel.tsx'), 'utf8')
    expect(panel).toContain('needsRegistration')
    expect(panel).toContain('Complete my registration')
    expect(panel).toContain('href="/register"')
  })
})
