/**
 * Single source of truth for the Sunday Smashers Christmas Mini Tournament
 * key dates. Admins can shift the whole site's countdown/hero copy by
 * editing the three ISO timestamps below — every consumer (landing page
 * hero, countdown, rules page) derives its copy from `getTournamentPhase()`.
 *
 * All timestamps carry explicit Sydney offsets: daylight saving starts the
 * first Sunday of October, so 6 Sep 2026 is AEST (+10:00) while
 * 13 Dec 2026 is AEDT (+11:00).
 */

/** Pre-registration opens (per the teaser poster). */
export const PRE_REGISTRATION_OPENS_AT = '2026-09-06T00:00:00+10:00'

/**
 * Registration closing date. Not yet announced by the admin team as of the
 * draft rules — assumed to be one week before the tournament so the
 * committee has time to finalise the draw. Adjust here once confirmed.
 */
export const REGISTRATION_CLOSES_AT = '2026-12-06T23:59:59+11:00'

/** Tournament day. */
export const TOURNAMENT_DATE = '2026-12-13T09:00:00+11:00'

/** Human-friendly, already-formatted version of the tournament date. */
export const TOURNAMENT_DATE_LABEL = 'Sunday, 13 December 2026'

export type TournamentPhase =
  | 'before-pre-registration'
  | 'registration-open'
  | 'registration-closed'
  | 'tournament-day-or-later'

export interface TournamentPhaseInfo {
  phase: TournamentPhase
  /** The moment the countdown on this phase should count down to. `null` once the event has arrived. */
  countdownTarget: string | null
  /** Short label for what the countdown is counting down to. */
  countdownLabel: string
  /** Headline copy for the hero/countdown card in this phase. */
  heading: string
}

/**
 * Derives which "phase" the site is in from a single `now` timestamp, so the
 * hero + countdown always agree and stay hydration-safe (the caller decides
 * whether `now` is a fixed SSR-safe placeholder or a live `Date.now()`).
 */
export function getTournamentPhase(now: Date): TournamentPhaseInfo {
  const nowMs = now.getTime()
  const preRegMs = new Date(PRE_REGISTRATION_OPENS_AT).getTime()
  const regCloseMs = new Date(REGISTRATION_CLOSES_AT).getTime()
  const tournamentMs = new Date(TOURNAMENT_DATE).getTime()

  if (nowMs < preRegMs) {
    return {
      phase: 'before-pre-registration',
      countdownTarget: PRE_REGISTRATION_OPENS_AT,
      countdownLabel: 'Pre-registration opens in',
      heading: 'Pre-registration opens soon!',
    }
  }

  if (nowMs < regCloseMs) {
    return {
      phase: 'registration-open',
      countdownTarget: REGISTRATION_CLOSES_AT,
      countdownLabel: 'Registration closes in',
      heading: 'Registration is OPEN!',
    }
  }

  if (nowMs < tournamentMs) {
    return {
      phase: 'registration-closed',
      countdownTarget: TOURNAMENT_DATE,
      countdownLabel: 'The Christmas battle begins in',
      heading: 'Registration is closed — see you on court!',
    }
  }

  return {
    phase: 'tournament-day-or-later',
    countdownTarget: null,
    countdownLabel: '',
    heading: "It's tournament day — let the smashes begin! 🎄🏸",
  }
}
