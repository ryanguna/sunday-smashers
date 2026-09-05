import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SITE_COPY,
  diffSiteCopy,
  normaliseSiteCopy,
  parseSiteCopy,
  SITE_COPY_FIELDS,
} from './site-copy'

describe('normaliseSiteCopy', () => {
  it('fills every missing field from the defaults', () => {
    // The blob on disk was written by an older deploy that had never heard of
    // half these fields. An absent string rendered into a page reads as
    // "undefined" to a player, which is the defect this guards.
    const copy = normaliseSiteCopy({ refundPolicyNote: 'No refunds after 1 Dec.' })
    expect(copy.refundPolicyNote).toBe('No refunds after 1 Dec.')
    expect(copy.declinedMessage).toBe(DEFAULT_SITE_COPY.declinedMessage)
    expect(copy.rulesAreFinal).toBe(DEFAULT_SITE_COPY.rulesAreFinal)
  })

  it('treats a blank or whitespace-only string as unset', () => {
    const copy = normaliseSiteCopy({ pendingMessage: '   ', approvedMessage: '' })
    expect(copy.pendingMessage).toBe(DEFAULT_SITE_COPY.pendingMessage)
    expect(copy.approvedMessage).toBe(DEFAULT_SITE_COPY.approvedMessage)
  })

  it('only accepts a real boolean for the rules flag', () => {
    expect(normaliseSiteCopy({ rulesAreFinal: true }).rulesAreFinal).toBe(true)
    // 'true' the string is what an HTML form posts, and it must not be enough
    // to silently mark draft rules final.
    expect(normaliseSiteCopy({ rulesAreFinal: 'true' }).rulesAreFinal).toBe(false)
  })

  it('survives junk', () => {
    for (const junk of [null, undefined, 42, 'nope', []]) {
      expect(normaliseSiteCopy(junk)).toEqual(DEFAULT_SITE_COPY)
    }
  })
})

describe('parseSiteCopy', () => {
  it('reads a stored JSON blob', () => {
    const stored = JSON.stringify({ ...DEFAULT_SITE_COPY, pendingMessage: 'Hang tight!' })
    expect(parseSiteCopy(stored).pendingMessage).toBe('Hang tight!')
  })

  it('falls back rather than throwing on malformed JSON', () => {
    expect(parseSiteCopy('{ not json')).toEqual(DEFAULT_SITE_COPY)
    expect(parseSiteCopy(null)).toEqual(DEFAULT_SITE_COPY)
  })
})

describe('SITE_COPY_FIELDS', () => {
  it('describes every field on the model, so nothing is uneditable', () => {
    // The editor renders from this catalogue. A field missing here is a field
    // the committee cannot change, which is the whole point of the feature.
    expect(SITE_COPY_FIELDS.map((field) => field.key).sort()).toEqual(
      Object.keys(DEFAULT_SITE_COPY).sort(),
    )
  })
})

describe('diffSiteCopy', () => {
  it('reports nothing when nothing changed', () => {
    expect(diffSiteCopy(DEFAULT_SITE_COPY, DEFAULT_SITE_COPY)).toEqual([])
  })

  it('names each changed field once', () => {
    const changes = diffSiteCopy(DEFAULT_SITE_COPY, {
      ...DEFAULT_SITE_COPY,
      rulesAreFinal: true,
      declinedMessage: 'Sorry, not this year.',
    })
    expect(changes).toHaveLength(2)
    expect(changes.map((change) => change.label).join(' ')).toMatch(/rules/i)
  })
})
