import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { createSyncTracker, describeSync, syncFailed, syncSucceeded, unsentRallies } from '@/lib/scoring'

/**
 * The offline banner tells the umpire their points "will send themselves when
 * the wifi returns". For a long time nothing did: `push` bailed out while
 * `navigator.onLine` was false and no listener ever retried, so the rallies sat
 * in localStorage until someone happened to tap another point. In a gym with
 * patchy wifi the last point of a game is the one nobody taps past.
 *
 * These tests hold the promise and the mechanism together.
 */
const CONSOLE = readFileSync(
  path.resolve(__dirname, 'ScoringConsole.tsx'),
  'utf8'
)

describe('unsentRallies', () => {
  it('counts what this phone is holding that the server has not taken', () => {
    const offline = syncFailed(createSyncTracker('idle', 0), 7, 'this phone is offline', true)
    expect(unsentRallies(offline)).toBe(7)
  })

  it('is zero once the server has acknowledged everything', () => {
    expect(unsentRallies(syncSucceeded(createSyncTracker('idle', 0), 7, 1))).toBe(0)
  })

  it('never goes negative if the server is somehow ahead', () => {
    const odd = { ...createSyncTracker('saved', 2), syncedRallies: 5, localRallies: 2 }
    expect(unsentRallies(odd)).toBe(0)
  })
})

describe('the console keeps the offline banner\'s promise', () => {
  it('still tells the umpire the points will send themselves', () => {
    const offline = syncFailed(createSyncTracker('idle', 0), 3, 'this phone is offline', true)
    expect(describeSync(offline).detail).toContain('send themselves')
  })

  it('re-sends on the browser reconnecting, not just on the next tap', () => {
    expect(
      CONSOLE,
      'no online listener — the banner promises a flush that never happens'
    ).toMatch(/addEventListener\(\s*'online'/)
    expect(CONSOLE).toMatch(/removeEventListener\(\s*'online'/)
  })

  it('the reconnect handler actually pushes, and only when something is held', () => {
    const anchor = CONSOLE.indexOf('function flush()')
    expect(anchor, 'the reconnect handler is gone').toBeGreaterThan(-1)
    const handler = CONSOLE.slice(anchor, CONSOLE.indexOf('}', CONSOLE.indexOf('send(current)')) + 1)

    expect(handler).toContain('unsentRallies')
    expect(handler, 'the handler never sends anything').toMatch(/send\(current\)/)
  })
})
