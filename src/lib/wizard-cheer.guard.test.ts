import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The registration wizard congratulates the player after every answer. That
 * cheer used to be a block element above the question, so each "Next" pushed
 * the entire form down, and a second reflow yanked it back up more than a
 * second later — after the player had already begun reading the next
 * question. Two unannounced layout shifts per step is what made the wizard
 * feel like it was lagging behind the taps.
 *
 * These pin the shape of the fix. Source-reading because vitest is configured
 * for `.ts` only and cannot render the component.
 */

const src = (path: string) => readFileSync(join(process.cwd(), 'src', path), 'utf8')

const wizard = () => src('components/registration/RegistrationWizard.tsx')

describe('the wizard cheer costs no layout', () => {
  it('is positioned out of the flow', () => {
    expect(wizard()).toMatch(/animate-cheer-toast[^"]*absolute/)
  })

  it('never intercepts a tap aimed at the form underneath it', () => {
    expect(wizard()).toMatch(/animate-cheer-toast[^"]*pointer-events-none/)
  })

  it('is not a block in the flow above the question any more', () => {
    // The giveaway from the old markup: a bottom margin, which only matters
    // for something taking up space in the layout.
    expect(wizard()).not.toMatch(/className="mb-4 flex items-center gap-2 rounded-\[var\(--radius-md\)\] bg-\[var\(--color-success-bg\)\]/)
  })
})

describe('the wizard cheer dismisses itself cleanly', () => {
  it('clears its timer, so a fast tapper does not cut the next cheer short', () => {
    const source = wizard()
    expect(source).toContain('globalThis.clearTimeout(timer)')
    // A bare setTimeout in the click handler is the leak this replaced.
    expect(source).not.toMatch(/globalThis\.setTimeout\(\(\) => setCheer\(null\), \d+\)\s*\n\s*}/)
  })

  it('re-keys each cheer so two identical ones in a row still animate', () => {
    expect(wizard()).toContain('id: (current?.id ?? 0) + 1')
    expect(wizard()).toContain('key={cheer.id}')
  })

  it('fades out under its own animation instead of vanishing between frames', () => {
    const css = src('app/globals.css')
    expect(css).toContain('@keyframes ss-cheer-toast')
    expect(css).toContain('.animate-cheer-toast')
  })

  it('unmounts only once that fade has finished', () => {
    // Mismatch these and the pill disappears mid-fade — the same snap the
    // whole change exists to remove.
    const durationMs = /animation: ss-cheer-toast ([\d.]+)s/.exec(src('app/globals.css'))?.[1]
    const timerMs = /const CHEER_MS = (\d+)/.exec(wizard())?.[1]
    expect(durationMs).toBeDefined()
    expect(timerMs).toBeDefined()
    expect(Number(timerMs)).toBe(Number(durationMs) * 1000)
  })
})
