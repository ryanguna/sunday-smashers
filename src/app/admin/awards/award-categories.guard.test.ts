import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The bug this fixes was not a missing feature — it was a feature wired up at
 * one end only. `parseDefinitions` read `site_content['award-config']` and
 * merged it over the shipped catalogue, the console described the awards as
 * configurable, and nothing anywhere ever wrote that row.
 *
 * So the tests that matter are the ones that fail if the editor is ever
 * unmounted or stops calling the actions, leaving the read side pointing at a
 * row nothing maintains again.
 */
function read(file: string): string {
  return readFileSync(path.resolve(__dirname, file), 'utf8')
}

const strip = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const CONSOLE = strip(read('AwardsAdminClient.tsx'))
const PANEL = strip(read('AwardCategoriesPanel.tsx'))
const ACTIONS = strip(read('actions.ts'))
const DATA = strip(read('data.ts'))

describe('the award catalogue can be edited from the console', () => {
  it('is actually mounted on the awards page', () => {
    expect(CONSOLE, 'the editor exists but nothing renders it').toContain(
      '<AwardCategoriesPanel',
    )
  })

  it('writes the row the console reads its catalogue from', () => {
    expect(DATA).toContain("AWARD_CONFIG_SLUG = 'award-config'")
    expect(ACTIONS, 'the writer targets a different row than the reader').toContain(
      'AWARD_CONFIG_SLUG',
    )
  })

  it('calls the save and delete actions rather than only rendering a form', () => {
    expect(PANEL).toContain('saveAwardCategoryAction')
    expect(PANEL).toContain('deleteAwardCategoryAction')
  })

  it('refreshes so the new award appears without a manual reload', () => {
    expect(PANEL).toContain('router.refresh()')
  })
})

describe('the catalogue writer defends itself', () => {
  it('re-checks admin, because a Server Action is a public endpoint', () => {
    const save = ACTIONS.slice(ACTIONS.indexOf('export async function saveAwardCategoryAction'))
    expect(save.slice(0, save.indexOf('export async function delete'))).toContain('ensureAdmin()')

    const remove = ACTIONS.slice(ACTIONS.indexOf('export async function deleteAwardCategoryAction'))
    expect(remove).toContain('ensureAdmin()')
  })

  it('reads the catalogue before rewriting it', () => {
    // The blob holds every category. Writing a mutated subset over an
    // unchecked read is how the settings console once lost the entry fees.
    expect(ACTIONS).toContain('readCatalogue(supabase)')
    expect(ACTIONS, 'a failed read must not be treated as an empty one').toContain(
      "if ('error' in current) return { ok: false, message: current.error }",
    )
  })

  it('only offers the awards that are safe to edit', () => {
    expect(PANEL).toContain("definition.category === 'special'")
  })
})
