import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The public Rules page stamps "working draft" on itself until the committee
 * marks the rules final. The flag behind that banner used to be reachable only
 * from the Messages tab, so the Rules page told admins their rules were a
 * draft and gave them nothing to click. These tests pin the publish control to
 * the Rules page and, more importantly, pin it to the *same* flag — a second
 * source of truth would let the two tabs disagree about whether the rules are
 * final.
 *
 * Source-reading rather than rendering because vitest only collects `.ts`.
 */

const src = (path: string) => readFileSync(join(process.cwd(), 'src', path), 'utf8')

describe('publishing the rules', () => {
  it('the Rules settings page renders the publish control', () => {
    const page = src('app/admin/settings/rules/page.tsx')
    expect(page).toContain('RulesPublishCard')
    expect(page).toContain('published={copy.rulesAreFinal}')
    expect(page).toContain('publish={setRulesPublishedAction}')
  })

  it('the publish action writes the same flag the Messages editor does', () => {
    const actions = src('app/admin/settings/copy/actions.ts')
    expect(actions).toContain('export async function setRulesPublishedAction')
    // Delegating to saveSiteCopyAction is what keeps the two tabs in agreement.
    expect(actions).toContain('saveSiteCopyAction({ ...current, rulesAreFinal: final })')
  })

  it('the public Rules page reads that same flag for its banner', () => {
    expect(src('app/rules/page.tsx')).toContain('copy.rulesAreFinal')
  })

  it('the scoring card no longer hardcodes "draft" in its heading', () => {
    // It used to read "Rules are a draft — change them here" regardless of the
    // actual state, which is what made the console look stuck.
    expect(src('components/settings/RulesEditor.tsx')).not.toContain('Rules are a draft')
  })

  it('the publish card states both halves of the switch', () => {
    const card = src('components/settings/RulesPublishCard.tsx')
    expect(card).toContain('Publish the rules')
    expect(card).toContain('Return to draft')
    // Un-publishing re-banners a page players may already have read.
    expect(card).toContain('window.confirm')
  })
})
