/**
 * Public-facing prose derived from the *configured* tournament format.
 *
 * The landing page explains how the tournament works in four steps. Those
 * steps used to be a hardcoded array quoting "15 points", "21 points" and
 * "top 4" — the same three numbers an organiser can change per division in
 * Settings → Divisions. Edit them there and the rules page updated while the
 * landing page kept advertising the old format, which is the first thing most
 * players read.
 *
 * These helpers rebuild that copy from `PublicDivisionSummary`, and cope with
 * the two awkward cases a hardcoded array cannot:
 *
 *  - **Divisions that disagree.** Men's and Women's Doubles are separate rows
 *    with separate scoring, so "first to 15" may be true of only one of them.
 *    Differing values are folded into "15 or 21 points depending on your
 *    division" rather than silently quoting whichever came first.
 *  - **A format without semi finals.** `qualifyingPlaces` can be 2 (straight
 *    to the Championship) or 0 (round robin decides everything), in which case
 *    the semi final and Battle for 3rd steps must not appear at all.
 *
 * With no published divisions — demo mode, or before setup — callers get the
 * seeded draft-rules copy, so the page never renders "first to points".
 */

import { DEFAULT_SITE_COPY } from '@/lib/site-copy'
import type { PublicDivisionSummary } from '@/lib/tournament-config'
import type { StageRulesConfig } from '@/lib/settings'

export interface HowItWorksStep {
  step: string
  title: string
  description: string
}

/**
 * The draft rules from `rules.png`, used until divisions are published.
 * Mirrors the seeded defaults in `defaultTournamentSettings()`.
 */
export const DEFAULT_HOW_IT_WORKS: readonly HowItWorksStep[] = [
  {
    step: '1',
    title: 'Round robin',
    description:
      'Every pair in your division plays every other pair once, first to 15 points (no deuce). Ranking is by wins, with head-to-head deciding ties.',
  },
  {
    step: '2',
    title: 'Top 4 qualify',
    description:
      'The top 4 ranked pairs move on to the semi-finals: Rank 1 vs Rank 4, and Rank 2 vs Rank 3.',
  },
  {
    step: '3',
    title: 'Semi-finals',
    description: 'Semis are first to 21 points (no deuce) — winner takes their spot in the final.',
  },
  {
    step: '4',
    title: 'Battle for 3rd & Championship',
    description:
      'Semi-final losers play the Battle for 3rd; semi-final winners play the Championship match for the title.',
  },
] as const

/** `[15]` → "15"; `[15, 21]` → "15 or 21"; `[11, 15, 21]` → "11, 15 or 21". */
export function joinWithOr(values: readonly (number | string)[]): string {
  const parts = values.map(String)
  if (parts.length === 0) return ''
  if (parts.length === 1) return parts[0]
  return `${parts.slice(0, -1).join(', ')} or ${parts[parts.length - 1]}`
}

/** Ascending unique values, so copy reads "15 or 21", never "21 or 15". */
function distinctAscending(values: readonly number[]): number[] {
  return [...new Set(values)].sort((a, b) => a - b)
}

/**
 * "first to 15 points (no deuce)", or "first to 15 or 21 points depending on
 * your division" when the divisions disagree.
 *
 * The deuce suffix is only added when every division agrees on it — claiming
 * "no deuce" while one division plays advantage would be worse than saying
 * nothing, and the rules page carries the per-division detail either way.
 */
export function describeTarget(stages: readonly StageRulesConfig[]): string {
  if (stages.length === 0) return ''
  const targets = distinctAscending(stages.map((s) => s.pointsToWin))
  const varies = targets.length > 1
  const points = `first to ${joinWithOr(targets)} point${targets.length === 1 && targets[0] === 1 ? '' : 's'}`
  const suffix = varies ? ' depending on your division' : ''

  const allNoDeuce = stages.every((s) => !s.deuce)
  const allDeuce = stages.every((s) => s.deuce)
  if (allNoDeuce) return `${points} (no deuce)${suffix}`
  if (allDeuce) return `${points} (win by 2)${suffix}`
  return `${points}${suffix}`
}

/**
 * Builds the landing page's "how it works" steps from the published divisions.
 *
 * Returns `DEFAULT_HOW_IT_WORKS` when nothing is published yet.
 */
export function howItWorksSteps(divisions: readonly PublicDivisionSummary[]): HowItWorksStep[] {
  if (divisions.length === 0) return [...DEFAULT_HOW_IT_WORKS]

  const steps: HowItWorksStep[] = [
    {
      step: '1',
      title: 'Round robin',
      description: `Every pair in your division plays every other pair once, ${describeTarget(
        divisions.map((d) => d.elims),
      )}. Ranking is by wins, with head-to-head deciding ties.`,
    },
  ]

  const places = distinctAscending(divisions.map((d) => d.qualifyingPlaces))
  const placesLabel = joinWithOr(places)
  // A division with fewer than 2 qualifiers has no knockout stage at all, so
  // the smallest value decides which steps are honest to show.
  const fewestPlaces = places[0]
  const mostPlaces = places[places.length - 1]
  const finalsTarget = describeTarget(divisions.map((d) => d.finals))

  if (mostPlaces < 2) {
    steps.push({
      step: '2',
      title: 'Ranking decides it',
      description:
        'There is no knockout stage — the round robin ranking is the final standing, so every game counts the same.',
    })
    return steps
  }

  steps.push({
    step: '2',
    title: `Top ${placesLabel} qualify`,
    description:
      fewestPlaces >= 4
        ? `The top ${placesLabel} ranked pairs move on to the semi-finals: Rank 1 vs Rank ${mostPlaces}, and Rank 2 vs Rank ${mostPlaces - 1}.`
        : `The top ${placesLabel} ranked pairs move on to the knockout stage.`,
  })

  if (fewestPlaces >= 4) {
    steps.push({
      step: '3',
      title: 'Semi-finals',
      description: `Semis are ${finalsTarget} — winner takes their spot in the final.`,
    })
    steps.push({
      step: '4',
      title: 'Battle for 3rd & Championship',
      description:
        'Semi-final losers play the Battle for 3rd; semi-final winners play the Championship match for the title.',
    })
  } else {
    steps.push({
      step: '3',
      title: 'Championship',
      description: `The qualifiers play off for the title, ${finalsTarget}.`,
    })
  }

  return steps
}

/**
 * The rules page's fallback body, built from the configured divisions.
 *
 * ## Why this is generated
 *
 * `/rules` renders an admin-editable `site_content` row, and falls back to
 * built-in markdown when that row does not exist — which is the normal state
 * until somebody writes one. That fallback used to quote "first to 15 points"
 * and "first to 21 points" as literal text, so the moment a division was
 * configured with anything else the page contradicted the engine that actually
 * scores the games. The committee could publish those rules as final and
 * players would be reading a promise the scoring console had no intention of
 * keeping.
 *
 * Only the numbers are derived. Officiating and scoresheets are prose
 * decisions rather than settings, so they stay written; the forfeit grace
 * period is configurable, because it decides when somebody loses a game and
 * it is the first thing shortened when a round robin runs long.
 */
export function defaultRulesMarkdown(
  divisions: readonly PublicDivisionSummary[],
  forfeitGraceMinutes: number = DEFAULT_SITE_COPY.forfeitGraceMinutes,
): string {
  const elims = divisions.length
    ? describeTarget(divisions.map((d) => d.elims))
    : 'first to 15 points (no deuce)'
  const finals = divisions.length
    ? describeTarget(divisions.map((d) => d.finals))
    : 'first to 21 points (no deuce)'

  const places = divisions.length ? distinctAscending(divisions.map((d) => d.qualifyingPlaces)) : [4]
  const placesLabel = joinWithOr(places)
  const mostPlaces = places[places.length - 1]
  const fewestPlaces = places[0]

  const knockout =
    fewestPlaces >= 4
      ? [
          '## Semis & Finals',
          '',
          `- **Semi-finals**: the top ${placesLabel} ranked pairs qualify. M1 = Rank 1 vs Rank ${mostPlaces}, M2 = Rank 2 vs Rank ${mostPlaces - 1}. Games are ${finals}.`,
          '- **Battle for 3rd**: the losers of M1 and M2 play off for third place.',
          '- **Championship**: the winners of M1 and M2 play for the title.',
        ]
      : mostPlaces >= 2
        ? [
            '## Finals',
            '',
            `- The top ${placesLabel} ranked pairs qualify for the knockout stage. Games are ${finals}.`,
            '- **Championship**: the qualifiers play off for the title.',
          ]
        : [
            '## No knockout stage',
            '',
            '- The round robin ranking is the final standing — there is no semi final or final.',
          ]

  // Singular reads badly as "1 minutes" on a page the committee publishes as
  // final, and the number is the difference between a pair walking on and a
  // pair losing a game they turned up for.
  const graceLabel = `${forfeitGraceMinutes} ${forfeitGraceMinutes === 1 ? 'minute' : 'minutes'}`

  return [
    '## Eliminations',
    '',
    '- Single round robin — every pair plays every other pair in their pool exactly once.',
    `- Games are played ${elims}.`,
    '- Ranking is by number of **wins**; ties are broken by **head-to-head** result (or a mini league / point difference / points scored for 3+ way ties).',
    '',
    ...knockout,
    '',
    '## Officiating & Scoresheets',
    '',
    '- Scoresheets are provided **per court** and must be **signed by both pairs after every game**.',
    '- The players in the **next match-up on that court** are rostered as:',
    '- **Umpire / Scorer**',
    '- **Scoresheet person**',
    '- **2x Line persons**',
    "- The umpire's and line judges' calls are **final**.",
    '- The scoresheet person **submits the signed scoresheet to the Tabulator at the end of each game**.',
    '',
    '## Forfeits',
    '',
    `- A pair has **${graceLabel}** from their match being called to be on court and ready. This is a fixed limit — the umpire starts it when the call goes out.`,
    `- **Late arrival or a no-show forfeits that game automatically** once ${graceLabel} is up.`,
  ].join('\n')
}
