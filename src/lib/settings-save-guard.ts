/**
 * Why a settings save cannot go ahead — if it cannot.
 *
 * These two states used to share one branch in the admin actions:
 *
 * ```ts
 * if (!isSupabaseConfigured() || !current.tournamentId) {
 *   return { ok: true, demo: true, message: 'Demo mode — …no database to save to.' }
 * }
 * ```
 *
 * That was wrong twice over. A committee on a live, correctly configured
 * project that simply had not created its tournament yet was told the database
 * was missing, and was handed `ok: true` — so the console reported success
 * while discarding every change. Splitting the states is the whole point of
 * this module, and the tests below make collapsing them again a failing build.
 */
export type SaveBlocker =
  /** No Supabase project is wired up. Sample data only; nothing can be stored. */
  | 'demo'
  /** The database is fine. Nobody has created the tournament row yet. */
  | 'no-tournament'

/**
 * Returns why a settings save must be refused, or `null` when it can proceed.
 *
 * `tournamentId` is only meaningful once Supabase is configured — in demo mode
 * it is always null, which is why the configuration check has to come first.
 */
export function settingsSaveBlocker(
  supabaseConfigured: boolean,
  tournamentId: string | null | undefined,
): SaveBlocker | null {
  if (!supabaseConfigured) return 'demo'
  if (!tournamentId) return 'no-tournament'
  return null
}

/**
 * Whether a blocker should be reported to the caller as a *successful* action.
 *
 * Demo mode is a deliberate no-op: the form validated, the diff was computed,
 * there was simply nowhere to put it, and the e2e suite runs entirely in this
 * state. A missing tournament is a genuine failure — the volunteer asked for
 * something to be stored and it was not.
 */
export function blockerIsSuccess(blocker: SaveBlocker): boolean {
  return blocker === 'demo'
}
