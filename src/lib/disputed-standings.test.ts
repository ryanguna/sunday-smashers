import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { standingsFromMatches } from './dashboard'
import { disputedMatchIds, resultIsDisputed, STANDINGS_EXCLUDED_STATUSES } from './scoresheet'
import type { PublicMatch } from './public-data'

/**
 * A disputed scoresheet used to count anyway.
 *
 * The sheet tells both pairs, in as many words, that a disputed result "does
 * not count until it is corrected". Nothing enforced it: standings were
 * computed from `matches.status` alone, in three separate places, none of
 * which read the sheet. A pair could contest a score, the tabulator could
 * agree and mark it disputed, and the contested win carried on deciding who
 * reached the semi finals.
 */

const base: Omit<PublicMatch, 'id' | 'teamA' | 'teamB' | 'scoreA' | 'scoreB' | 'resultDisputed'> = {
  division: 'mens_doubles',
  stage: 'elims',
  court: 'Court 1',
  slotIndex: 1,
  slotLabel: '9:00am',
  slotStartsAt: null,
  sourceA: null,
  sourceB: null,
  status: 'completed',
  pointsToWin: 15,
  deuce: false,
  cap: null,
  forfeitedBy: null,
  winnerTeamId: null,
  duties: [],
}

function match(
  id: string,
  a: string,
  b: string,
  scoreA: number,
  scoreB: number,
  resultDisputed = false,
): PublicMatch {
  return {
    ...base,
    id,
    teamA: { id: a, division: 'mens_doubles', name: a, seed: null, players: [] },
    teamB: { id: b, division: 'mens_doubles', name: b, seed: null, players: [] },
    scoreA,
    scoreB,
    resultDisputed,
  } as PublicMatch
}

describe('the rule has one home', () => {
  it('treats only a disputed sheet as excluded', () => {
    expect(STANDINGS_EXCLUDED_STATUSES).toEqual(['disputed'])
    expect(resultIsDisputed('disputed')).toBe(true)
  })

  it('does not exclude paperwork that is merely unfinished', () => {
    // Requiring a *verified* sheet would drop every match played on paper or
    // entered by an admin, and empty the standings on the day.
    for (const status of ['draft', 'awaiting_signature', 'submitted', 'verified'] as const) {
      expect(resultIsDisputed(status)).toBe(false)
    }
  })

  it('collects the disputed match ids and nothing else', () => {
    const ids = disputedMatchIds([
      { match_id: 'm1', status: 'disputed' },
      { match_id: 'm2', status: 'verified' },
      { match_id: 'm3', status: 'submitted' },
      { match_id: 'm4', status: 'disputed' },
    ])
    expect([...ids].sort()).toEqual(['m1', 'm4'])
  })
})

describe('a contested win does not decide the standings', () => {
  const clean = [match('m1', 'a', 'b', 15, 9), match('m2', 'a', 'c', 15, 11)]

  it('counts a win whose sheet nobody has contested', () => {
    const rows = standingsFromMatches(clean, 'mens_doubles')
    expect(rows.find((r) => r.teamId === 'a')?.wins).toBe(2)
  })

  it('drops the win once the sheet is disputed', () => {
    const rows = standingsFromMatches(
      [clean[0], match('m2', 'a', 'c', 15, 11, true)],
      'mens_doubles',
    )
    expect(rows.find((r) => r.teamId === 'a')?.wins).toBe(1)
    expect(rows.find((r) => r.teamId === 'a')?.played).toBe(1)
  })

  it('gives the loss back too — a dispute removes the whole result', () => {
    const rows = standingsFromMatches(
      [clean[0], match('m2', 'a', 'c', 15, 11, true)],
      'mens_doubles',
    )
    expect(rows.find((r) => r.teamId === 'c')?.losses).toBe(0)
  })

  it('keeps the pair in the table rather than removing them', () => {
    const rows = standingsFromMatches([match('m1', 'a', 'b', 15, 9, true)], 'mens_doubles')
    expect(rows.map((r) => r.teamId).sort()).toEqual(['a', 'b'])
  })

  it('changes who is top when the contested result was the decider', () => {
    // a and b both beat c; a beat b on a sheet b is contesting.
    const matches = [
      match('m1', 'a', 'c', 15, 5),
      match('m2', 'b', 'c', 15, 5),
      match('m3', 'a', 'b', 15, 14, true),
    ]
    const rows = standingsFromMatches(matches, 'mens_doubles')
    expect(rows.find((r) => r.teamId === 'a')?.wins).toBe(1)
    expect(rows.find((r) => r.teamId === 'b')?.wins).toBe(1)
    expect(rows.find((r) => r.teamId === 'b')?.losses).toBe(0)
  })
})

describe('every place that computes standings applies it', () => {
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

  it('excludes disputed results from the public tables', () => {
    const source = strip(readFileSync('src/lib/public-data.ts', 'utf8'))
    expect(source).toMatch(/disputedMatchIds\(/)
    expect(source).toMatch(/stage === 'elims' && !disputed\.has\(m\.id\)/)
  })

  it('excludes them from the player dashboard', () => {
    const source = strip(readFileSync('src/lib/dashboard.ts', 'utf8'))
    expect(source).toMatch(/if \(match\.resultDisputed\) continue/)
  })

  it('excludes them from the admin draw workbench that picks the qualifiers', () => {
    const source = strip(readFileSync('src/app/admin/draw/data.ts', 'utf8'))
    expect(source).toMatch(/disputedMatchIds\(/)
    expect(source).toMatch(/\.filter\(\(match\) => !disputed\.has\(match\.id\)\)/)
  })

  it('tells players a result is missing rather than silently subtracting it', () => {
    const source = strip(readFileSync('src/app/standings/page.tsx', 'utf8'))
    expect(source).toMatch(/disputedResults/)
    expect(source).toMatch(/disagreement over the scoresheet/)
  })
})

describe('the standings page reads the qualification line from the division', () => {
  const source = readFileSync('src/app/standings/page.tsx', 'utf8')

  it('no longer hardcodes four qualifying spots', () => {
    expect(source).not.toMatch(/QUALIFYING_SPOTS = 4/)
    expect(source).toMatch(/standings\.division\.qualifyingPlaces/)
  })

  it('says "final" rather than "semis" for a straight final', () => {
    expect(source).toMatch(/spots === 2 \? 'final' : 'semis'/)
  })
})
