/**
 * One-time passwords an organiser reads out or pastes into a chat.
 *
 * When a player is locked out, the committee cannot email them a reset link —
 * there is no mail server. The fallback is an admin setting a temporary
 * password and passing it to the player over the channel they already use
 * (Messenger, or out loud across a gym). That constraint drives the format:
 *
 * - **Two festive words plus four digits**, e.g. `Holly-Smash-4821`. Long
 *   enough that it cannot be guessed in the hours it exists, short enough to
 *   dictate without spelling every character.
 * - **No ambiguous characters.** Digits avoid `0` and `1`; the words are
 *   fixed and unambiguous. `l/1/I` and `O/0` confusion is the main way a
 *   dictated password fails.
 * - **Capitalised words plus digits** so it clears any password policy that
 *   wants mixed case and a number.
 *
 * The password is deliberately temporary: the player is told to change it at
 * `/account/password` immediately, and nothing stores it — the admin sees it
 * once, in the response to their own click.
 */

const ADJECTIVES = [
  'Holly',
  'Jolly',
  'Frosty',
  'Merry',
  'Tinsel',
  'Cocoa',
  'Ginger',
  'Snowy',
  'Festive',
  'Sleigh',
  'Candy',
  'Starry',
] as const

const NOUNS = [
  'Smash',
  'Shuttle',
  'Rally',
  'Serve',
  'Drive',
  'Drop',
  'Clear',
  'Net',
  'Lift',
  'Court',
  'Racket',
  'Ace',
] as const

/** Digits with `0` and `1` removed — they are the ones misheard as O and I/l. */
const DIGITS = '23456789'

/**
 * Random integer in `[0, max)` using the platform CSPRNG.
 *
 * `Math.random` is not acceptable here: this value is a credential, however
 * short-lived. `crypto.getRandomValues` exists in Node 18+ and the Edge
 * runtime alike, so no import is needed.
 *
 * Values are rejected and redrawn when they fall in the final, incomplete
 * block of the 32-bit range, so every outcome is equally likely rather than
 * the low ones being marginally favoured by a plain modulo.
 */
function randomBelow(max: number): number {
  const limit = Math.floor(0xffffffff / max) * max
  const buffer = new Uint32Array(1)
  let value = 0
  do {
    crypto.getRandomValues(buffer)
    value = buffer[0]
  } while (value >= limit)
  return value % max
}

function pick<T>(items: readonly T[]): T {
  return items[randomBelow(items.length)]
}

/**
 * Generate a temporary password, e.g. `Holly-Smash-4821`.
 *
 * Search space is 12 × 12 × 8^4 ≈ 590k. That is small on its own, which is
 * precisely why the value is single-use and the player is told to replace it:
 * it is a handoff token, not a password they keep. Supabase's own auth rate
 * limiting stands between it and a brute-force attempt.
 */
export function generateTemporaryPassword(): string {
  const digits = Array.from({ length: 4 }, () => DIGITS[randomBelow(DIGITS.length)]).join('')
  return `${pick(ADJECTIVES)}-${pick(NOUNS)}-${digits}`
}

/** Shape of a temporary password, for tests and for validating manual entry. */
export const TEMPORARY_PASSWORD_PATTERN = /^[A-Z][a-z]+-[A-Z][a-z]+-[2-9]{4}$/
