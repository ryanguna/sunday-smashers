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
