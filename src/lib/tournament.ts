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

/** Every date the site says out loud is said in the venue's own time zone. */
export const SYDNEY_TIME_ZONE = 'Australia/Sydney'

/**
 * Human-friendly, already-formatted version of the *default* tournament date.
 *
 * Prefer `formatTournamentDateLabel(dates.tournamentDate)` in anything a
 * visitor sees. This constant cannot reflect a date an organiser has since
 * changed in the admin console, so using it directly silently pins the page
 * to the seeded date — which is exactly the drift the rest of this module
 * exists to prevent.
 */
export const TOURNAMENT_DATE_LABEL = 'Sunday, 13 December 2026'

/**
 * Formats a tournament date the way the site says it out loud —
 * "Sunday, 13 December 2026".
 *
 * Always rendered in Sydney time. Without an explicit `timeZone` this would be
 * formatted in the *server's* zone: a Vercel lambda runs in UTC, so a 9am AEDT
 * start (10pm UTC the previous day) would render as the 12th and the whole
 * site would advertise the wrong day.
 *
 * Falls back to the seeded label if the value is unparseable, so a malformed
 * row degrades to a stale date rather than "Invalid Date".
 */
export function formatTournamentDateLabel(iso: string | null | undefined): string {
  if (!iso) return TOURNAMENT_DATE_LABEL
  const parsed = new Date(iso)
  if (Number.isNaN(parsed.getTime())) return TOURNAMENT_DATE_LABEL
  return parsed.toLocaleDateString('en-AU', {
    timeZone: SYDNEY_TIME_ZONE,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

/**
 * Formats a date without the weekday — "6 September 2026" — for the places
 * that read as a sentence ("Pre-registration opens 6 September 2026").
 */
export function formatTournamentDate(iso: string | null | undefined): string {
  if (!iso) return ''
  const parsed = new Date(iso)
  if (Number.isNaN(parsed.getTime())) return ''
  return parsed.toLocaleDateString('en-AU', {
    timeZone: SYDNEY_TIME_ZONE,
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

/**
 * Day and month only — "13 December" — for headings and running prose where
 * the year is already obvious from context.
 *
 * Exists so those places can stop hardcoding the seeded date. Returns an empty
 * string for a missing or unparseable value so callers can drop the clause
 * entirely rather than print "Invalid Date" at a visitor.
 */
export function formatTournamentDayMonth(iso: string | null | undefined): string {
  if (!iso) return ''
  const parsed = new Date(iso)
  if (Number.isNaN(parsed.getTime())) return ''
  return parsed.toLocaleDateString('en-AU', {
    timeZone: SYDNEY_TIME_ZONE,
    day: 'numeric',
    month: 'long',
  })
}

/**
 * The three dates the whole site's phase logic turns on.
 *
 * These used to be readable ONLY as the module constants below, which meant
 * the public countdown and the registration gate were pinned in source: an
 * organiser could change the date in the admin console and the public site
 * would keep quoting the old one until someone shipped a code change. The
 * constants are now just the *defaults* — the real values come from the
 * `tournaments` row via `tournamentDatesFrom()`.
 */
export interface TournamentDates {
  preRegistrationOpensAt: string
  registrationClosesAt: string
  tournamentDate: string
}

/** The seeded values, used until a tournament row says otherwise. */
export const DEFAULT_TOURNAMENT_DATES: TournamentDates = {
  preRegistrationOpensAt: PRE_REGISTRATION_OPENS_AT,
  registrationClosesAt: REGISTRATION_CLOSES_AT,
  tournamentDate: TOURNAMENT_DATE,
}

/**
 * Builds the phase dates from a tournament row (or anything shaped like one).
 * Any missing field falls back to its default, so a partially filled row can
 * never produce an `Invalid Date` and knock the countdown out.
 */
export function tournamentDatesFrom(
  row: {
    registration_opens_at?: string | null
    registration_closes_at?: string | null
    tournament_date?: string | null
  } | null
  | undefined,
): TournamentDates {
  const usable = (value: string | null | undefined, fallback: string): string =>
    value && !Number.isNaN(Date.parse(value)) ? value : fallback

  return {
    preRegistrationOpensAt: usable(
      row?.registration_opens_at,
      PRE_REGISTRATION_OPENS_AT,
    ),
    registrationClosesAt: usable(row?.registration_closes_at, REGISTRATION_CLOSES_AT),
    tournamentDate: usable(row?.tournament_date, TOURNAMENT_DATE),
  }
}

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
export function getTournamentPhase(
  now: Date,
  dates: TournamentDates = DEFAULT_TOURNAMENT_DATES,
): TournamentPhaseInfo {
  const nowMs = now.getTime()
  const preRegMs = new Date(dates.preRegistrationOpensAt).getTime()
  const regCloseMs = new Date(dates.registrationClosesAt).getTime()
  const tournamentMs = new Date(dates.tournamentDate).getTime()

  if (nowMs < preRegMs) {
    return {
      phase: 'before-pre-registration',
      countdownTarget: dates.preRegistrationOpensAt,
      countdownLabel: 'Pre-registration opens in',
      heading: 'Pre-registration opens soon!',
    }
  }

  if (nowMs < regCloseMs) {
    return {
      phase: 'registration-open',
      countdownTarget: dates.registrationClosesAt,
      // "Pre-registration", not "Registration": entering is a request the
      // committee reviews, and calling it registration here while the rest of
      // the site calls it pre-registration reads as two different deadlines.
      countdownLabel: 'Pre-registration closes in',
      heading: 'Pre-registration is OPEN!',
    }
  }

  if (nowMs < tournamentMs) {
    return {
      phase: 'registration-closed',
      countdownTarget: dates.tournamentDate,
      countdownLabel: 'The Christmas battle begins in',
      heading: 'Pre-registration is closed — see you on court!',
    }
  }

  return {
    phase: 'tournament-day-or-later',
    countdownTarget: null,
    countdownLabel: '',
    heading: "It's tournament day — let the smashes begin! 🎄🏸",
  }
}
