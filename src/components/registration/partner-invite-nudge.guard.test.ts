import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * A partner invite is saved, never sent.
 *
 * There is no mailer and no SMS provider in this project, so the only way an
 * invited partner finds out is by signing up and looking at their dashboard.
 * The confirmation screen nonetheless said "Partner invite sent", and nothing
 * told the one person who *can* reach them — the player who just typed their
 * email — that it was now their job.
 *
 * These read source rather than render, because vitest here runs in `node`
 * with no DOM. They are narrow on purpose: the words that make the promise,
 * and the component that keeps it.
 */
function read(file: string): string {
  return readFileSync(path.resolve(__dirname, file), 'utf8')
}

/** Strips comments so the explanations below don't satisfy their own assertions. */
function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

const CONFIRMATION = code(read('ConfirmationPanel.tsx'))
const INVITES = code(read('InvitesPanel.tsx'))
const PROMPT = read('SharePartnerInvitePrompt.tsx')

describe('the registration confirmation does not claim an invite was sent', () => {
  it('never says the invite was sent', () => {
    expect(
      CONFIRMATION,
      'nothing sends a partner invite — there is no mailer',
    ).not.toMatch(/invite sent/i)
  })

  it('says it was saved instead', () => {
    expect(CONFIRMATION).toMatch(/Partner invite saved/)
  })

  it('asks the player to pass the invite on themselves', () => {
    expect(
      CONFIRMATION,
      'the player is told an invite exists but never told to deliver it',
    ).toContain('SharePartnerInvitePrompt')
  })
})

describe('the invites page nudges the sender of a pending invite', () => {
  it('offers the share prompt while an invite is still waiting', () => {
    expect(INVITES).toContain('SharePartnerInvitePrompt')
    expect(INVITES).toMatch(/outgoing\.some\(\(invite\) => invite\.status === 'pending'\)/)
  })
})

describe('the share prompt', () => {
  it('admits that nothing is going out on its own', () => {
    expect(PROMPT).toMatch(/no email or\s+text going out/)
  })

  it('gives them a link their partner can actually use', () => {
    expect(PROMPT).toContain('/register/invites')
    expect(PROMPT).toContain('window.location.origin')
  })

  it('puts the message on screen as well as on the clipboard', () => {
    // Clipboard access is refused in some in-app browsers, so a copy button on
    // its own would leave those players with nothing to send.
    expect(PROMPT).toContain('navigator.clipboard.writeText')
    expect(PROMPT, 'the message must be selectable when copying fails').toContain('select-all')
  })

  it('reads the origin without a hydration mismatch', () => {
    expect(PROMPT).toContain('useSyncExternalStore')
  })
})
