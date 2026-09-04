import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { generateKnockout, type StandingRow, type TeamId } from './draw'
import { knockoutReadiness } from './draw-admin'
import { defaultRulesConfig, knockoutGameCount, validateRules } from './settings'

/**
 * `qualifyingPlaces` is a per-division setting the admin console has always
 * offered, validated and described — while `generateKnockout()` ignored it and
 * built the four-pair bracket every time.
 *
 * The interesting cases are the ones the setting allows but the engine never
 * built: a straight final (2), and a wider bracket (6+).
 */

const standingsOf = (order: TeamId[]): StandingRow[] =>
  order.map((teamId, i) => ({
    teamId,
    rank: i + 1,
    played: 10,
    wins: 10 - i,
    losses: i,
    forfeits: 0,
    pointsFor: 150,
    pointsAgainst: 100,
    pointDiff: 50,
    tiebreak: 'wins' as const,
    needsAdminDecision: false,
  }))

const eight = standingsOf(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'])

describe('a straight final (qualifyingPlaces = 2)', () => {
  const bracket = generateKnockout(eight, undefined, undefined, 2)

  it('is a single Championship fixture', () => {
    expect(bracket.map((f) => f.key)).toEqual(['FINAL'])
  })

  it('puts the top two pairs in it, straight from the ranking', () => {
    const final = bracket[0]
    expect(final.teamA).toBe('a')
    expect(final.teamB).toBe('b')
    expect(final.sourceA).toBe('Rank 1')
    expect(final.sourceB).toBe('Rank 2')
  })

  it('does not put pairs who missed out onto a semi final court', () => {
    // The bug: rank 3 and rank 4 were told they had not qualified and were
    // then scheduled to play M2 anyway.
    const teams = bracket.flatMap((f) => [f.teamA, f.teamB])
    expect(teams).not.toContain('c')
    expect(teams).not.toContain('d')
  })

  it('has no Battle for 3rd, because no one loses a semi final', () => {
    expect(bracket.find((f) => f.key === 'THIRD')).toBeUndefined()
  })

  it('ignores semi results, which cannot exist in this format', () => {
    const withResults = generateKnockout(
      eight,
      { m1: { teamA: 'a', teamB: 'd', pointsA: 21, pointsB: 10 } },
      undefined,
      2,
    )
    expect(withResults.map((f) => f.key)).toEqual(['FINAL'])
    expect(withResults[0].teamA).toBe('a')
    expect(withResults[0].teamB).toBe('b')
  })
})

describe('a wider bracket (qualifyingPlaces = 6)', () => {
  const bracket = generateKnockout(eight, undefined, undefined, 6)

  it('seeds the top pair against the lowest qualifier, not against rank 4', () => {
    const m1 = bracket.find((f) => f.key === 'M1')!
    expect(m1.teamA).toBe('a')
    expect(m1.teamB).toBe('f')
    expect(m1.sourceA).toBe('Rank 1')
    expect(m1.sourceB).toBe('Rank 6')
  })

  it('seeds rank 2 against rank 5', () => {
    const m2 = bracket.find((f) => f.key === 'M2')!
    expect(m2.teamA).toBe('b')
    expect(m2.teamB).toBe('e')
    expect(m2.sourceB).toBe('Rank 5')
  })

  it('never names a rank beyond the qualifying cut', () => {
    for (const fixture of bracket) {
      for (const source of [fixture.sourceA, fixture.sourceB]) {
        const rank = /^Rank (\d+)$/.exec(source)
        if (rank) expect(Number(rank[1])).toBeLessThanOrEqual(6)
      }
    }
  })
})

describe('the draft rules (qualifyingPlaces = 4) are unchanged', () => {
  it('still seeds rank 1 v rank 4 and rank 2 v rank 3 by default', () => {
    const bracket = generateKnockout(standingsOf(['a', 'b', 'c', 'd']))
    const m1 = bracket.find((f) => f.key === 'M1')!
    const m2 = bracket.find((f) => f.key === 'M2')!
    expect([m1.teamA, m1.teamB]).toEqual(['a', 'd'])
    expect([m2.teamA, m2.teamB]).toEqual(['b', 'c'])
  })

  it('still produces all four fixtures', () => {
    expect(generateKnockout(standingsOf(['a', 'b', 'c', 'd'])).map((f) => f.key)).toEqual([
      'M1',
      'M2',
      'THIRD',
      'FINAL',
    ])
  })
})

describe('the engine and the day-load estimate agree', () => {
  // This is the cross-check that would have caught the original defect:
  // `knockoutGameCount()` has always returned 1 for a straight final, and the
  // engine has always returned 4 fixtures regardless. The admin's estimated
  // finish time was computed from one number and the court schedule from the
  // other.
  it.each([2, 4, 6, 8])('builds exactly knockoutGameCount(%i) fixtures', (places) => {
    const bracket = generateKnockout(eight, undefined, undefined, places)
    expect(bracket).toHaveLength(knockoutGameCount(places))
  })
})

describe('formats the database cannot store are refused before the save', () => {
  // `divisions.qualifying_places` carries `check (qualifying_places >= 2)`, so
  // "no knockout" was an option the editor offered and Postgres rejected.
  it.each([0, 1])('rejects %i qualifiers with a message about the alternatives', (places) => {
    const rules = defaultRulesConfig()
    rules.qualifyingPlaces = places
    const issues = validateRules('r', rules).filter((i) => i.path === 'r.qualifyingPlaces')
    expect(issues.map((i) => i.severity)).toContain('error')
    expect(issues[0].message).toMatch(/straight final|2/)
  })

  it('still accepts the two formats the engine builds', () => {
    for (const places of [2, 4]) {
      const rules = defaultRulesConfig()
      rules.qualifyingPlaces = places
      const issues = validateRules('r', rules).filter(
        (i) => i.path === 'r.qualifyingPlaces' && i.severity === 'error',
      )
      expect(issues).toEqual([])
    }
  })

  it('does not offer an unstorable value in the rules editor', () => {
    const source = readFileSync('src/components/settings/RulesEditor.tsx', 'utf8')
    const field = source.slice(source.indexOf('Pairs advancing to the knockout'))
    expect(field).toMatch(/min=\{2\}/)
    expect(field).not.toMatch(/0 for no knockout/)
  })
})

describe('the readiness message names the format that is actually configured', () => {
  const done = { complete: true, remaining: 0, played: 10, total: 10, percent: 100 }

  it('does not send a straight-final admin looking for semi finals', () => {
    const readiness = knockoutReadiness(done, standingsOf(['a']), [], 2)
    expect(readiness.ready).toBe(false)
    expect(readiness.reason).toContain('the final')
    expect(readiness.reason).not.toContain('semi finals')
  })

  it('still says semi finals when semis are the configured format', () => {
    const readiness = knockoutReadiness(done, standingsOf(['a', 'b']), [], 4)
    expect(readiness.reason).toContain('semi finals')
  })

  it('tells a short division it can lower the qualifiers instead', () => {
    // A 3-pair division cannot fill a 4-pair bracket. The way out is a
    // setting, so point at it rather than leaving them stuck.
    const readiness = knockoutReadiness(done, standingsOf(['a', 'b', 'c']), [], 4)
    expect(readiness.reason).toMatch(/Drop the qualifiers/)
  })
})

describe('publishing writes the configured bracket, not a defaulted one', () => {
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
  const actions = strip(readFileSync('src/app/admin/draw/actions.ts', 'utf8'))
  const workbench = strip(readFileSync('src/components/draw/KnockoutWorkbench.tsx', 'utf8'))

  it('passes the division setting into the engine', () => {
    expect(actions).toMatch(/generateKnockout\(\s*standings,\s*undefined,\s*input\.rules,\s*places\s*\)/)
  })

  it('gates on the configured number of qualifiers rather than a literal four', () => {
    expect(actions).toMatch(/rankedTeamIds\.length < places/)
    expect(actions).not.toMatch(/rankedTeamIds\.length < 4/)
  })

  it('records the qualifiers the format actually used', () => {
    expect(actions).not.toMatch(/slice\(0, 4\)/)
    expect(actions).toMatch(/slice\(0, places\)/)
  })

  it('is handed the setting by the workbench', () => {
    expect(workbench).toMatch(/qualifyingPlaces: division\.qualifyingPlaces/)
    expect(workbench).toMatch(/generateKnockout\([^)]*division\.qualifyingPlaces\)/)
  })

  it('shows the public bracket with the same setting the admin published', () => {
    const publicData = strip(readFileSync('src/lib/public-data.ts', 'utf8'))
    expect(publicData).toMatch(/generateKnockout\([^)]*qualifyingPlaces\)/)
  })
})
