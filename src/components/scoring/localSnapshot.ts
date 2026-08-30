'use client'

import { parseSnapshot, scoringStorageKey, type ScoringSnapshot } from '@/lib/scoring'

/**
 * The umpire's phone as a tiny external store.
 *
 * Every tap is written to `localStorage` synchronously *before* it is sent to
 * the server, so a dropped connection, a locked screen or an accidental
 * refresh can never lose a rally. The state is exposed through
 * `useSyncExternalStore` rather than an effect: React renders the server
 * snapshot during hydration and swaps to the browser value straight after,
 * so there is no hydration mismatch and no mount gate.
 */

const listeners = new Set<() => void>()

function emit() {
  for (const listener of listeners) listener()
}

export function subscribeLocalSnapshot(onChange: () => void): () => void {
  listeners.add(onChange)
  // Another tab (or a second console on the same phone) writing the same match.
  window.addEventListener('storage', onChange)
  return () => {
    listeners.delete(onChange)
    window.removeEventListener('storage', onChange)
  }
}

/**
 * The raw stored JSON, or `null`. Returned as a string on purpose: React
 * compares snapshots with `Object.is`, and equal strings are identical, so
 * this never causes an infinite re-render the way a fresh object would.
 */
export function readLocalSnapshot(matchId: string): string | null {
  try {
    return window.localStorage.getItem(scoringStorageKey(matchId))
  } catch {
    // Private browsing / storage disabled — the console still works, it just
    // loses its offline safety net.
    return null
  }
}

/** Server render and hydration both see "nothing stored yet". */
export function serverSnapshot(): string | null {
  return null
}

export function writeLocalSnapshot(matchId: string, raw: string): void {
  try {
    window.localStorage.setItem(scoringStorageKey(matchId), raw)
    emit()
  } catch {
    // Ignore — the in-memory rally log is still authoritative for this session.
  }
}

export function clearLocalSnapshot(matchId: string): void {
  try {
    window.localStorage.removeItem(scoringStorageKey(matchId))
    emit()
  } catch {
    // Ignore.
  }
}

export function parseLocalSnapshot(raw: string | null): ScoringSnapshot | null {
  return parseSnapshot(raw)
}
