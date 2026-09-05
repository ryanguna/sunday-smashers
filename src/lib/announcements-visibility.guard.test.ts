import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The notice board is one feature with three surfaces: its own page, the strip
 * on the landing page and the strip on the player dashboard. Only the page is
 * gated by `PageGate`; the two strips are rendered inline, so switching the
 * board off in Settings > Pages would leave them visibly contradicting the
 * switch. These tests pin the wiring, because vitest is configured for `.ts`
 * only (`vitest.config.mts`) and cannot render the components themselves.
 */

const src = (path: string) => readFileSync(join(process.cwd(), 'src', path), 'utf8')

describe('announcements strips honour the page-visibility switch', () => {
  it('the landing page reads the switch and guards the section with it', () => {
    const page = src('app/page.tsx')
    expect(page).toContain("loadSitePageVisibility")
    expect(page).toContain("isPageVisible(pageVisibility, 'announcements')")
    expect(page).toMatch(/showAnnouncements \? \(\s*<section/)
  })

  it('the landing page hides the strip when nothing has been published', () => {
    // An empty "no announcements yet" card above the fold advertises an unused
    // feature instead of the tournament, so the strip has to wait for content.
    expect(src('app/page.tsx')).toContain('latestAnnouncements(announcements, 3).length > 0')
  })

  it('the dashboard reads the same switch', () => {
    const page = src('app/dashboard/page.tsx')
    expect(page).toContain("isPageVisible(await loadSitePageVisibility(), 'announcements')")
    expect(page).toMatch(/showAnnouncements &&\s*\(?\s*<AnnouncementsStrip/)
  })

  it('announcements is still a toggleable page, or the switch above is dead code', () => {
    expect(src('lib/site-pages.ts')).toContain("key: 'announcements'")
  })
})
