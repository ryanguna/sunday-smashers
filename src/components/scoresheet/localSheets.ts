'use client'

import type { SheetState } from '@/lib/scoresheet'

/**
 * Demo mode's scoresheet drawer.
 *
 * With no Supabase configured there is no database to file a sheet in, but a
 * reviewer still has to be able to walk the whole chain — sign, sign, submit,
 * verify — and see `/tabulator` react to it. So in demo mode (and *only* in
 * demo mode) each sheet's state is kept in `localStorage` and layered over the
 * server-rendered fixtures.
 *
 * Exposed through `useSyncExternalStore` rather than an effect: React renders
 * `serverOverlays()` (nothing stored) during hydration and swaps to the
 * browser value immediately after, so there is no hydration mismatch and no
 * mount gate hiding one.
 *
 * When Supabase *is* configured this module is never read — the Server Actions
 * in `src/app/scoresheets/actions.ts` own the state.
 */

const STORAGE_KEY = 'sunday-smashers.scoresheets.demo.v1'

const listeners = new Set<() => void>()

function emit() {
  for (const listener of listeners) listener()
}

export function subscribeOverlays(onChange: () => void): () => void {
  listeners.add(onChange)
  window.addEventListener('storage', onChange)
  return () => {
    listeners.delete(onChange)
    window.removeEventListener('storage', onChange)
  }
}

/**
 * The raw stored JSON, or `null`. A string on purpose: React compares
 * snapshots with `Object.is`, and equal strings are identical, so this can
 * never spin into an infinite re-render the way a fresh object would.
 */
export function readOverlays(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

/** Server render and hydration both see "nothing stored yet". */
export function serverOverlays(): string | null {
  return null
}

export function parseOverlays(raw: string | null): Record<string, SheetState> {
  if (!raw) return {}
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return parsed as Record<string, SheetState>
  } catch {
    return {}
  }
}

export function writeOverlay(state: SheetState): void {
  try {
    const current = parseOverlays(readOverlays())
    current[state.matchId] = state
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(current))
    emit()
  } catch {
    // Private browsing / storage disabled. The sheet still works for this
    // page view; it just will not follow you to `/tabulator`.
  }
}

export function clearOverlays(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY)
    emit()
  } catch {
    // Ignore.
  }
}

/** The stored sheet for a match, or the server's copy when there is none. */
export function overlayFor(raw: string | null, fallback: SheetState): SheetState {
  const stored = parseOverlays(raw)[fallback.matchId]
  return stored && typeof stored.status === 'string' ? stored : fallback
}
