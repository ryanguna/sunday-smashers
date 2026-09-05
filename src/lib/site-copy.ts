/**
 * The committee's own words: the handful of sentences the site says on their
 * behalf that they were previously unable to change without a deploy.
 *
 * ## Why this exists
 *
 * These strings are not decoration. "Your entry was declined" and "refunds are
 * only possible before X" are the committee speaking to a real player about
 * their money and their place in the draw, and the wording has to be theirs.
 * Every one of them started life hard-coded in a component, which meant the
 * rules page was permanently stamped "draft" because nothing could ever mark
 * it final.
 *
 * ## Why one blob rather than a table
 *
 * There is no per-row lifecycle here — nothing is published, scheduled or
 * versioned independently — so a row per sentence would buy nothing but joins.
 * It lives in `site_content` under `SITE_COPY_SLUG` as JSON, the same shape
 * the prize board and settings extras already use.
 *
 * ## Why every read goes through `normaliseSiteCopy`
 *
 * The blob is JSON written by an older deploy as often as not. A field added
 * today is simply absent from what was stored yesterday, and an absent string
 * rendered into a page reads as "undefined" to a player. Reads coerce to the
 * default rather than trusting the parse.
 *
 * Pure and dependency-free so it can be unit tested without Supabase.
 */

export const SITE_COPY_SLUG = 'site-copy'

export interface SiteCopy {
  /**
   * Clears the "these rules are a working draft" banner on `/rules`.
   *
   * Defaults to `false`: the rules genuinely are a draft until the committee
   * says otherwise, and a banner shown one day too long is harmless where one
   * missing is a player turning up to a format they never agreed to.
   */
  rulesAreFinal: boolean
  /** Shown on the entry form and the confirmation. Refunds are real money, so this is theirs to word. */
  refundPolicyNote: string
  /** Reassurance for anyone registering without a partner. */
  partnerDisclaimer: string
  /** Shown under the skill level question, which is what the committee pairs on. */
  skillPairingDisclaimer: string
  /** What an approved player is told once the committee lets them in. */
  approvedMessage: string
  /** What someone still waiting sees instead of the rest of the app. */
  pendingMessage: string
  /** What a declined player sees. The only thing they will ever read from us. */
  declinedMessage: string
  /** What a waitlisted player sees. */
  waitlistedMessage: string
}

export const DEFAULT_SITE_COPY: SiteCopy = {
  rulesAreFinal: false,
  refundPolicyNote:
    'Entry fees can be refunded up to 30 November 2026. After that date your fee covers courts, shuttles and prizes that are already paid for, so it can no longer be returned.',
  partnerDisclaimer:
    'No partner? No problem — register anyway. If you cannot find a partner we will find one for you.',
  skillPairingDisclaimer:
    'You will be paired according to the skill level you pick here, so please be honest — it makes for better games for everyone.',
  approvedMessage:
    'You are in! 🎄 Your entry has been approved by the committee. Have a look around — your matches, duties and the schedule all show up here once the draw is published.',
  pendingMessage:
    'Thanks for pre-registering! Your entry is with the committee for review. There is nothing else to do right now — we will let you know the moment you are approved.',
  declinedMessage:
    'Sorry — the committee was not able to accept your entry for this tournament. Thank you for your interest, and we hope to see you on court next time. If you think this is a mistake, please contact an organiser.',
  waitlistedMessage:
    'You are on the waitlist. The draw is full for now, but spots open up more often than you would think — we will contact you if one does.',
}

function text(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim().length > 0 ? value : fallback
}

/** Coerces whatever was stored into a complete, renderable `SiteCopy`. */
export function normaliseSiteCopy(parsed: unknown): SiteCopy {
  if (!parsed || typeof parsed !== 'object') return DEFAULT_SITE_COPY
  const raw = parsed as Partial<Record<keyof SiteCopy, unknown>>
  return {
    rulesAreFinal: raw.rulesAreFinal === true,
    refundPolicyNote: text(raw.refundPolicyNote, DEFAULT_SITE_COPY.refundPolicyNote),
    partnerDisclaimer: text(raw.partnerDisclaimer, DEFAULT_SITE_COPY.partnerDisclaimer),
    skillPairingDisclaimer: text(raw.skillPairingDisclaimer, DEFAULT_SITE_COPY.skillPairingDisclaimer),
    approvedMessage: text(raw.approvedMessage, DEFAULT_SITE_COPY.approvedMessage),
    pendingMessage: text(raw.pendingMessage, DEFAULT_SITE_COPY.pendingMessage),
    declinedMessage: text(raw.declinedMessage, DEFAULT_SITE_COPY.declinedMessage),
    waitlistedMessage: text(raw.waitlistedMessage, DEFAULT_SITE_COPY.waitlistedMessage),
  }
}

/** Parses a raw `site_content.body_markdown` JSON blob. Never throws. */
export function parseSiteCopy(body: unknown): SiteCopy {
  if (typeof body !== 'string') return DEFAULT_SITE_COPY
  try {
    return normaliseSiteCopy(JSON.parse(body))
  } catch {
    return DEFAULT_SITE_COPY
  }
}

export interface SiteCopyField {
  key: keyof SiteCopy
  label: string
  hint: string
  /** Long copy gets a textarea; the rules toggle gets a checkbox. */
  kind: 'toggle' | 'text'
}

/** Drives the admin editor, so a new field shows up there by adding it here. */
export const SITE_COPY_FIELDS: readonly SiteCopyField[] = [
  {
    key: 'rulesAreFinal',
    label: 'Rules are final',
    hint: 'Clears the “working draft” banner on the Rules page. Leave off while the format can still change.',
    kind: 'toggle',
  },
  {
    key: 'refundPolicyNote',
    label: 'Refunds & cancellations',
    hint: 'Say the actual date after which an entry fee can no longer be refunded.',
    kind: 'text',
  },
  {
    key: 'partnerDisclaimer',
    label: 'No-partner reassurance',
    hint: 'Shown on the entry form so nobody skips registering just because they have not found a partner.',
    kind: 'text',
  },
  {
    key: 'skillPairingDisclaimer',
    label: 'Skill level disclaimer',
    hint: 'Shown under the skill level question. Explains that pairing follows the answer.',
    kind: 'text',
  },
  {
    key: 'pendingMessage',
    label: 'Entry under review',
    hint: 'What someone sees while the committee is still reviewing their entry.',
    kind: 'text',
  },
  {
    key: 'approvedMessage',
    label: 'Entry approved',
    hint: 'The welcome an approved player sees on their dashboard.',
    kind: 'text',
  },
  {
    key: 'waitlistedMessage',
    label: 'Waitlisted',
    hint: 'What a waitlisted player sees.',
    kind: 'text',
  },
  {
    key: 'declinedMessage',
    label: 'Entry declined',
    hint: 'The only message a declined player will ever read. Worth being kind.',
    kind: 'text',
  },
]

/** Human-readable diff for the audit log, in the shape the settings console uses. */
export function diffSiteCopy(before: SiteCopy, after: SiteCopy): { label: string; from: string; to: string }[] {
  const changes: { label: string; from: string; to: string }[] = []
  for (const field of SITE_COPY_FIELDS) {
    const from = String(before[field.key])
    const to = String(after[field.key])
    if (from !== to) changes.push({ label: field.label, from, to })
  }
  return changes
}
