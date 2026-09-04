import { describe, expect, it } from 'vitest'

import {
  DEFAULT_AWARD_DEFINITIONS,
  awardKeyFromLabel,
  isBuiltInAwardKey,
  isPlacingAwardKey,
  mergeAwardDefinitions,
  removeAwardCategory,
  upsertAwardCategory,
  validateAwardCategory,
  type AwardCategoryDraft,
  type AwardDefinition,
} from './awards'

/**
 * The award catalogue was readable-configurable and writable-nowhere:
 * `parseDefinitions` merged overrides from `site_content['award-config']`, but
 * nothing ever wrote that row, so "best Christmas jumper" meant hand-editing
 * JSON in the SQL editor.
 *
 * The rule that matters most here is that placings stay derived. They come
 * from `finalPlacings` over the real results, and a hand-typed champion beside
 * a computed one is the defect this project keeps unpicking.
 */

const draft = (over: Partial<AwardCategoryDraft> = {}): AwardCategoryDraft => ({
  key: 'best_jumper',
  label: 'Best Christmas jumper',
  blurb: 'The outfit that made the gym laugh loudest.',
  scope: 'player',
  icon: 'sparkle',
  ...over,
})

describe('awardKeyFromLabel', () => {
  it('makes a storable key out of what an organiser actually types', () => {
    expect(awardKeyFromLabel('Best Christmas Jumper!')).toBe('best_christmas_jumper')
  })

  it('does not leave stray separators at either end', () => {
    expect(awardKeyFromLabel('  🎄 Most improved 🎄  ')).toBe('most_improved')
  })

  it('stays inside the award_key_format check constraint', () => {
    const key = awardKeyFromLabel('x'.repeat(80))
    expect(key.length).toBeLessThanOrEqual(48)
  })

  it('is empty when there is nothing to make a key from', () => {
    expect(awardKeyFromLabel('🎄🎄')).toBe('')
  })
})

describe('validateAwardCategory', () => {
  it('accepts a normal discretionary award', () => {
    expect(validateAwardCategory(draft())).toBeNull()
  })

  it('refuses an award with no name', () => {
    expect(validateAwardCategory(draft({ label: '  ' }))).toMatch(/name/i)
  })

  it('refuses a name that cannot become a key', () => {
    expect(validateAwardCategory(draft({ key: '' }))).toMatch(/letters or numbers/i)
  })

  it('refuses to let a placing be redefined by hand', () => {
    for (const key of ['champion', 'runner_up', 'third_place', 'fourth_place']) {
      expect(
        validateAwardCategory(draft({ key, label: 'Champion of vibes' })),
        `${key} must stay derived from the results`,
      ).toMatch(/come from the results/i)
    }
  })

  it('refuses an icon the UI cannot draw', () => {
    expect(
      validateAwardCategory(draft({ icon: 'candy-cane' as never })),
    ).toMatch(/icons/i)
  })
})

describe('isPlacingAwardKey / isBuiltInAwardKey', () => {
  it('knows the four placings are computed', () => {
    expect(isPlacingAwardKey('champion')).toBe(true)
    expect(isPlacingAwardKey('mvp')).toBe(false)
  })

  it('knows which keys ship with the app', () => {
    // Removing a shipped key only drops the override, so the UI has to say
    // "reset" rather than "remove" or it promises a deletion it cannot do.
    expect(isBuiltInAwardKey('mvp')).toBe(true)
    expect(isBuiltInAwardKey('best_jumper')).toBe(false)
  })
})

describe('upsertAwardCategory', () => {
  it('adds a new award to an empty catalogue', () => {
    const next = upsertAwardCategory([], draft())
    expect(next).toHaveLength(1)
    expect(next[0]).toMatchObject({
      key: 'best_jumper',
      label: 'Best Christmas jumper',
      category: 'special',
      dbType: 'special_mention',
    })
  })

  it('edits in place rather than adding a second entry for the same key', () => {
    const once = upsertAwardCategory([], draft())
    const twice = upsertAwardCategory(once, draft({ label: 'Worst Christmas jumper' }))
    expect(twice).toHaveLength(1)
    expect(twice[0].label).toBe('Worst Christmas jumper')
  })

  it('keeps fields the form does not edit, so awards do not reorder on a rename', () => {
    const existing = [{ key: 'best_jumper', label: 'Old', sortOrder: 15 }]
    const next = upsertAwardCategory(existing, draft({ label: 'New' }))
    expect(next[0].sortOrder).toBe(15)
  })

  it('trims what the organiser typed', () => {
    const next = upsertAwardCategory([], draft({ label: '  Spirit of Christmas  ' }))
    expect(next[0].label).toBe('Spirit of Christmas')
  })

  it('leaves other awards alone', () => {
    const existing = [{ key: 'mvp', label: 'Most valuable partner' }]
    const next = upsertAwardCategory(existing, draft())
    expect(next.map((entry) => entry.key)).toEqual(['mvp', 'best_jumper'])
  })
})

describe('removeAwardCategory', () => {
  it('drops only the named override', () => {
    const catalogue = upsertAwardCategory(
      upsertAwardCategory([], draft()),
      draft({ key: 'loudest_smash', label: 'Loudest smash' }),
    )
    expect(removeAwardCategory(catalogue, 'best_jumper').map((entry) => entry.key)).toEqual([
      'loudest_smash',
    ])
  })

  it('restores a built-in rather than deleting it', () => {
    const overridden = upsertAwardCategory([], draft({ key: 'mvp', label: 'Renamed' }))
    expect(mergeAwardDefinitions(overridden).find((d) => d.key === 'mvp')?.label).toBe('Renamed')

    const shipped = DEFAULT_AWARD_DEFINITIONS.find((d) => d.key === 'mvp') as AwardDefinition
    expect(
      mergeAwardDefinitions(removeAwardCategory(overridden, 'mvp')).find((d) => d.key === 'mvp')
        ?.label,
    ).toBe(shipped.label)
  })
})

describe('what an organiser saves is what the awards page reads', () => {
  it('round-trips through the same merge the console renders from', () => {
    const stored = upsertAwardCategory([], draft())
    const definition = mergeAwardDefinitions(stored).find((d) => d.key === 'best_jumper')

    expect(definition, 'the saved award never reached the catalogue').toBeDefined()
    expect(definition?.label).toBe('Best Christmas jumper')
    expect(definition?.scope).toBe('player')
    expect(definition?.category).toBe('special')
  })

  it('survives the JSON trip the Server Action makes it take', () => {
    const stored = JSON.parse(
      JSON.stringify({ awards: upsertAwardCategory([], draft({ scope: 'team' })) }),
    ) as { awards: Partial<AwardDefinition>[] }

    expect(mergeAwardDefinitions(stored.awards).find((d) => d.key === 'best_jumper')?.scope).toBe(
      'team',
    )
  })
})
