/**
 * First-run setup — the path from "empty Supabase project" to "a committee
 * member can actually use the admin console".
 *
 * Two audit blockers live here:
 *
 *   B3  The first admin could only be created by hand-writing SQL. Every
 *       signup gets 'player', and the only role-granting UI sits behind the
 *       admin guard, so an empty system could never produce its first admin.
 *
 *   B1  There was no UI anywhere that INSERTs a tournament row — every admin
 *       loader only ever UPDATEs one. On an empty database the settings page
 *       silently reported "saved" while writing nothing, forever.
 *
 * Everything in this module is pure so it can be unit tested without a
 * database; the server actions in `src/app/setup/actions.ts` do the I/O.
 *
 * Validation is deliberately NOT reimplemented here: the tournament details
 * form reuses `validateTournamentDetails` from `@/lib/settings`, which is the
 * same function the admin settings page uses. This project has a documented,
 * repeatedly-recurring defect where a rule is restated in a second place and
 * the two copies then drift, so the only rule this file owns is the slug.
 */
import {
  validateTournamentDetails,
  type SettingsIssue,
  type TournamentDetails,
} from '@/lib/settings'

/** Where the committee is up to in setting the tournament up. */
export type SetupStage =
  | 'unconfigured' // no database is connected at all — nothing to set up yet
  | 'needs-account' // nobody is signed in yet
  | 'claim-admin' // signed in, but the system has no admin at all
  | 'create-tournament' // admin exists, but there is no tournament row
  | 'complete' // both done — setup has nothing left to offer

export interface SetupStatus {
  /** False in demo mode: there is no Supabase project behind the app. */
  isConfigured: boolean
  hasAdmin: boolean
  hasTournament: boolean
  isSignedIn: boolean
  /**
   * Which half of the connection is present. Both false means nothing has been
   * wired yet; a URL with no key is the far more common state, because the key
   * is the one value that has to be copied out of the Supabase dashboard by
   * hand.
   */
  hasUrl?: boolean
  hasKey?: boolean
}

export interface SetupStepInfo {
  stage: SetupStage
  /** 1-based position, for the "step 2 of 3" garland. */
  step: number
  totalSteps: number
  heading: string
  blurb: string
}

const TOTAL_STEPS = 3

/**
 * Derives the single stage the setup screen should render. Kept pure and in
 * one place so the page, the redirect guard and the tests can never disagree
 * about whether setup is finished.
 */
export function deriveSetupStage(status: SetupStatus): SetupStepInfo {
  // Checked first: without a database the other three flags describe nothing.
  // Reporting "setup is done" here would tell an organiser an organiser and a
  // tournament exist when in fact no database does.
  if (!status.isConfigured) {
    // Telling someone to do work they have already done is how a runbook loses
    // their trust: they either redo it or stop reading. A project whose URL is
    // set has plainly been created and migrated, and exactly one value is
    // still missing — so say that instead of restating the whole sequence.
    if (status.hasUrl && !status.hasKey) {
      return {
        stage: 'unconfigured',
        step: 1,
        totalSteps: TOTAL_STEPS,
        heading: 'One value left to connect',
        blurb:
          'The Supabase project is connected but NEXT_PUBLIC_SUPABASE_ANON_KEY is missing, so the app is still running on sample data. Copy the publishable key from Supabase (Project Settings › API Keys), set it in Vercel for Production, and redeploy.',
      }
    }

    return {
      stage: 'unconfigured',
      step: 1,
      totalSteps: TOTAL_STEPS,
      heading: 'Connect a database first',
      blurb:
        'This site is running on sample data — no Supabase project is connected, so nothing you enter here would be saved. Set the two environment variables, push the migrations, then come back.',
    }
  }

  if (status.hasAdmin && status.hasTournament) {
    return {
      stage: 'complete',
      step: TOTAL_STEPS,
      totalSteps: TOTAL_STEPS,
      heading: 'The hall is ready',
      blurb:
        'Setup is done — an organiser and a tournament both exist. Everything from here happens in the admin console.',
    }
  }

  if (!status.isSignedIn) {
    return {
      stage: 'needs-account',
      step: 1,
      totalSteps: TOTAL_STEPS,
      heading: 'First, sign in',
      blurb:
        'Setup hands the keys to whoever is signed in, so start with the account the committee will actually use. Create it, confirm the email, then come back here.',
    }
  }

  if (!status.hasAdmin) {
    return {
      stage: 'claim-admin',
      step: 2,
      totalSteps: TOTAL_STEPS,
      heading: 'Claim the organiser keys',
      blurb:
        'Nobody runs this tournament yet. Take the first organiser seat and the door closes behind you — after this, only an existing organiser can add another from Settings › Roles.',
    }
  }

  return {
    stage: 'create-tournament',
    step: 3,
    totalSteps: TOTAL_STEPS,
    heading: 'Set up the tournament',
    blurb:
      'One tournament row is what the whole site hangs off — the countdown, the registration gate, the courts and the draw. Fill this in and the console comes alive.',
  }
}

/** True once setup can no longer do anything useful. */
export function isSetupComplete(status: SetupStatus): boolean {
  return deriveSetupStage(status).stage === 'complete'
}

/**
 * URL-safe slug from a tournament name. The slug is a permanent public
 * identifier, so it is generated once here rather than typed by hand.
 */
export function slugify(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '')
}

/**
 * The first-run form. It carries the entry fee as *typed text* rather than
 * `TournamentDetails.entryFeeCents`, so a half-typed "12." is a validation
 * message instead of a silent NaN — hence the omit.
 */
export interface SetupFormValues extends Omit<TournamentDetails, 'entryFeeCents'> {
  slug: string
  /** Entry fee per player, as typed — dollars, free text so we can validate it. */
  entryFee: string
  doorsOpenAt: string
}

/** Dollars (as typed) to integer cents, or `null` if it isn't a usable amount. */
export function parseEntryFeeCents(input: string): number | null {
  const trimmed = input.trim().replace(/^\$/, '')
  if (!trimmed) return null
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null
  return Math.round(Number(trimmed) * 100)
}

/**
 * Formats a fee for display, dollar sign included.
 *
 * The sign belongs here rather than at each call site: while callers added
 * their own, /pay shipped without one and quoted a bare "25".
 */
export function formatEntryFee(cents: number | null | undefined): string {
  if (cents == null) return ''
  return `$${(cents / 100).toFixed(2).replace(/\.00$/, '')}`
}

/**
 * What it costs one player to enter, as a phrase a page can print.
 *
 * Players ask "how much?" before they ask anything else, and the answer was
 * only ever printed in a "what to bring" card near the bottom of the landing
 * page — the entry form itself never mentioned money at all, so it was
 * possible to pre-register without ever being told the fee.
 *
 * Deliberately one figure. A pair total alongside it turned a single number
 * into arithmetic to check, on the line that most needs to be read once and
 * believed.
 *
 * Returns `null` when no fee is configured. A tournament with no fee saved
 * yet must say nothing rather than "$0", which reads as free.
 */
export function describeEntryFee(cents: number | null | undefined): string | null {
  if (cents == null || cents <= 0) return null
  return `${formatEntryFee(cents)} per player`
}

/**
 * Validates the setup form. Delegates every shared rule to
 * `validateTournamentDetails` and only adds the fields that exist nowhere
 * else (slug, fee, doors-open time).
 */
export function validateSetupForm(values: SetupFormValues): SettingsIssue[] {
  const issues: SettingsIssue[] = [
    // The shared rules, with the typed fee resolved to cents so the one
    // validator covers both screens. An unparseable fee is reported below.
    ...validateTournamentDetails({ ...values, entryFeeCents: parseEntryFeeCents(values.entryFee) ?? 0 }),
  ]

  const slug = values.slug.trim()
  if (!slug) {
    issues.push({ severity: 'error', path: 'slug', message: 'Every tournament needs a web address.' })
  } else if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) {
    issues.push({
      severity: 'error',
      path: 'slug',
      message: 'Use lowercase letters, numbers and hyphens only — it becomes part of the link you share.',
    })
  }

  if (values.entryFee.trim() && parseEntryFeeCents(values.entryFee) === null) {
    issues.push({
      severity: 'error',
      path: 'entryFee',
      message: 'Enter the fee as a plain amount, like 25 or 25.50.',
    })
  }
  if (!values.entryFee.trim()) {
    issues.push({
      severity: 'warning',
      path: 'entryFee',
      message: 'Without a fee, players are told to pay you but never told how much.',
    })
  } else if (!values.paymentInstructions.trim()) {
    issues.push({
      severity: 'warning',
      path: 'paymentInstructions',
      message: 'Add how to pay — bank details or PayID, and what reference to use.',
    })
  }

  if (values.doorsOpenAt.trim()) {
    const doors = Date.parse(values.doorsOpenAt)
    const firstServe = Date.parse(values.tournamentDate)
    if (Number.isNaN(doors)) {
      issues.push({ severity: 'error', path: 'doorsOpenAt', message: 'Pick a valid arrival time.' })
    } else if (!Number.isNaN(firstServe) && doors > firstServe) {
      issues.push({
        severity: 'error',
        path: 'doorsOpenAt',
        message: 'Doors cannot open after the first serve.',
      })
    }
  } else {
    issues.push({
      severity: 'warning',
      path: 'doorsOpenAt',
      message: 'A late arrival forfeits their game — only fair to tell people when to turn up.',
    })
  }

  return issues
}

/** Errors block the save; warnings are shown but do not. */
export function setupFormErrors(values: SetupFormValues): SettingsIssue[] {
  return validateSetupForm(values).filter((issue) => issue.severity === 'error')
}

export function canSubmitSetupForm(values: SetupFormValues): boolean {
  return setupFormErrors(values).length === 0
}
