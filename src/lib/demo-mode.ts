import { isSupabaseConfigured } from '@/lib/supabase/config'

/**
 * The ONE rule for bundled sample data, in one place.
 *
 * Demo data is returned **if and only if Supabase is not configured**. It is
 * never a fallback for an empty table and never a fallback for a failed
 * query.
 *
 * That used to be the other way round: several admin loaders swapped in the
 * demo set whenever a table came back empty or a query threw. On a real but
 * still-empty project that painted ~44 invented players and invented money
 * across `/admin`, `/admin/registrations`, `/admin/payments` and
 * `/admin/teams` — while the write actions stayed pointed at the real
 * database, so a volunteer pressing "Approve" on a fabricated row sent a
 * fabricated id to Supabase. An empty console is honest; a fake one is not.
 *
 * Because `isDemo` now comes from exactly one place, `isDemo === true`
 * guarantees there is no database to write to, which is the same condition
 * every admin server action already checks before it refuses to write. Demo
 * rows therefore cannot reach a real database.
 */

/** Copy shown to a volunteer when a live query failed. Plain English, no jargon. */
export const DATA_LOAD_ERROR_MESSAGE =
  "We couldn't reach the database just then, so this page may be missing things. Nothing has been lost — give it a moment and refresh."

export interface LoadedData<T> {
  data: T
  /** True only when Supabase is not configured. */
  isDemo: boolean
  /** Set when the live query failed. `data` is the empty shape in that case. */
  error: string | null
}

/**
 * Resolves a page's data from exactly one of three sources:
 *   - `demo()`  — Supabase is not configured (demo mode).
 *   - `live()`  — Supabase is configured and the queries succeeded, however
 *                 few rows came back. Zero rows is a real, honest result.
 *   - `empty()` — Supabase is configured but a query failed. The page renders
 *                 its empty state alongside `error`.
 */
export async function loadLiveOrDemo<T>(source: {
  demo: () => T | Promise<T>
  live: () => Promise<T>
  empty: () => T | Promise<T>
}): Promise<LoadedData<T>> {
  if (!isSupabaseConfigured()) {
    return { data: await source.demo(), isDemo: true, error: null }
  }

  try {
    return { data: await source.live(), isDemo: false, error: null }
  } catch {
    return { data: await source.empty(), isDemo: false, error: DATA_LOAD_ERROR_MESSAGE }
  }
}

/**
 * Unwraps a Supabase result, throwing when the query errored so
 * `loadLiveOrDemo()` can surface it instead of silently treating a failure as
 * "no rows". Use for every query whose emptiness would otherwise be
 * indistinguishable from a permission or network failure.
 */
export function rowsOrThrow<T>(result: {
  data: T[] | null
  error: { message: string } | null
}): T[] {
  if (result.error) throw new Error(result.error.message)
  return result.data ?? []
}

/** Single-row variant of {@link rowsOrThrow}. */
export function rowOrThrow<T>(result: {
  data: T | null
  error: { message: string } | null
}): T | null {
  if (result.error) throw new Error(result.error.message)
  return result.data
}
