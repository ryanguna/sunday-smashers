import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * A rejected player had nowhere to go.
 *
 * The dashboard offered "Try again" pointing at `/register`, but
 * `unique (division_id, player_id)` refuses a second entry for the same
 * division, so the wizard loaded with a permanently disabled submit button.
 * Only the committee can reopen the existing row, so the card now points at
 * the contact details.
 *
 * That swaps one dead end for another unless the anchor actually exists, and
 * the anchor lives in a different file from the link. This is the second home
 * for that value, so it gets a guard.
 */
function read(...parts: string[]): string {
  return readFileSync(join(process.cwd(), 'src', ...parts), 'utf8')
}

describe('the rejected-entry card has somewhere to send the player', () => {
  it('the status view links to the contact anchor', () => {
    expect(read('lib', 'dashboard.ts')).toContain("href: '/#contact'")
  })

  it('the landing page defines that anchor', () => {
    expect(read('app', 'page.tsx')).toContain('id="contact"')
  })

  it('the anchor clears the sticky header when scrolled to', () => {
    // Without scroll margin the target lands underneath the fixed banner and
    // the player sees the wrong part of the page.
    const landing = read('app', 'page.tsx')
    const anchor = landing.indexOf('id="contact"')
    expect(landing.slice(anchor, anchor + 200)).toMatch(/scroll-mt-/)
  })

  it('no longer offers to retry a registration the database will refuse', () => {
    expect(read('lib', 'dashboard.ts')).not.toContain("actionLabel: 'Try again'")
  })
})

describe('the approval gate keeps that escape hatch reachable', () => {
  it('the status page offers the contact anchor to a declined entry', () => {
    // The dashboard card above is now unreachable for a declined player — the
    // gate in `src/lib/registration-gate.ts` redirects them to `/status`
    // before it renders — so the only route back to a human has to be there.
    expect(read('app', 'status', 'page.tsx')).toContain("href=\"/#contact\"")
  })
})

describe('post-registration call to action', () => {
  it('sends a fresh applicant to their status, not a dashboard they cannot open', () => {
    // The person reading the confirmation panel has just applied, so they are
    // pending by definition and the gate would bounce /dashboard straight to
    // /status. Linking there directly avoids a redirect the moment after the
    // single most important action on the site.
    const panel = readFileSync(
      join(process.cwd(), 'src', 'components', 'registration', 'ConfirmationPanel.tsx'),
      'utf8',
    )
    expect(panel).toContain('href="/status"')
    expect(panel).not.toContain('href="/dashboard"')
  })
})
