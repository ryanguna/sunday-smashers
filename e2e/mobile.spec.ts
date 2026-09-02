import { test, expect } from '@playwright/test'

/**
 * Mobile-first guarantees, enforced at the width phones actually are.
 *
 * `smoke.spec.ts` already checked six routes for sideways scroll at 390px.
 * That missed three real defects, all of them on the admin console, which is
 * exactly where organisers work from a phone on match day:
 *
 *  - `/admin/schedule` scrolled **634px** sideways at 390px. The schedule grid
 *    is deliberately `min-w-[46rem]` inside an `overflow-x-auto` wrapper, but
 *    every flex and grid ancestor defaults to `min-width: auto`, so instead of
 *    the table scrolling inside its box, the whole page stretched.
 *  - `/admin/draw` overflowed 24px at 320px, because an implicit grid track is
 *    floored at its items' min-content width.
 *  - `/admin/duty-roster` overflowed 7px at 320px, because a stat card label
 *    ("Matches rostered") is wider than the ~48px its column left it.
 *
 * None of those reproduce at 390px alone, and none were on the old six-route
 * list. So this file checks **every** route at **320px** — the iPhone SE and
 * older Android width, and the narrowest thing anyone will bring to a gym.
 */

const ROUTES = [
  '/',
  '/rules',
  '/announcements',
  '/gallery',
  '/schedule',
  '/standings',
  '/bracket',
  '/live',
  '/players',
  '/awards',
  '/pay',
  '/login',
  '/signup',
  '/forgot-password',
  '/account/password',
  '/register',
  '/dashboard',
  '/scoresheets',
  '/scoring',
  '/tabulator',
  '/tv/court-1',
  '/admin',
  '/admin/registrations',
  '/admin/payments',
  '/admin/teams',
  '/admin/draw',
  '/admin/schedule',
  '/admin/duty-roster',
  '/admin/matches',
  '/admin/announcements',
  '/admin/awards',
  '/admin/gallery',
  '/admin/checklist',
  '/admin/settings',
  '/admin/settings/divisions',
  '/admin/settings/courts',
  '/admin/settings/pages',
  '/admin/settings/prizes',
  '/admin/settings/roles',
  '/admin/settings/rules',
] as const

/** iPhone SE / older Android. Anything wider hides these bugs. */
const NARROW = { width: 320, height: 780 }

test.describe('no sideways scroll at 320px', () => {
  for (const route of ROUTES) {
    test(route, async ({ page }) => {
      await page.setViewportSize(NARROW)
      await page.goto(route)
      await page.waitForLoadState('networkidle')

      const { overflow, culprits } = await page.evaluate(() => {
        const de = document.documentElement
        const width = de.clientWidth
        const culprits: string[] = []
        for (const el of Array.from(document.querySelectorAll('body *'))) {
          const rect = el.getBoundingClientRect()
          if (rect.width === 0 || rect.height === 0) continue
          if (rect.right > width + 1) {
            culprits.push(
              `<${el.tagName.toLowerCase()} class="${String(el.className).slice(0, 70)}"> right=${Math.round(rect.right)}`,
            )
          }
        }
        return { overflow: de.scrollWidth - de.clientWidth, culprits: culprits.slice(-3) }
      })

      expect(overflow, `${route} scrolls sideways by ${overflow}px. Widest: ${culprits.join(' | ')}`)
        .toBeLessThanOrEqual(1)
    })
  }
})

/**
 * WCAG 2.2 success criterion 2.5.8 (Target Size — Minimum, Level AA): every
 * pointer target is at least 24x24 CSS pixels.
 *
 * Two exemptions in the spec are honoured below, because applying the rule
 * without them produces noise rather than findings:
 *
 *  - **Inline**: a link inside a sentence is exempt. Those are matched by
 *    checking whether the anchor's parent is a text container.
 *  - **User agent control**: not claimed here — the checkboxes were the real
 *    failures (16x16 and 20x20), and they are now 24x24.
 *
 * The skip link is `sr-only` until focused, so it measures 1x1 and is skipped.
 */
const TARGET_ROUTES = [
  '/',
  '/register',
  '/dashboard',
  '/admin/settings',
  '/admin/settings/divisions',
  '/admin/settings/pages',
  '/admin/settings/rules',
  '/admin/checklist',
  '/admin/registrations',
] as const

test.describe('tap targets meet WCAG 2.5.8 at 390px', () => {
  for (const route of TARGET_ROUTES) {
    test(route, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 })
      await page.goto(route)
      await page.waitForLoadState('networkidle')

      const undersized = await page.evaluate(() => {
        const PROSE = ['P', 'LI', 'SPAN', 'DD', 'DT', 'TD', 'LABEL']
        const found: string[] = []
        const selector =
          'a[href],button,input:not([type=hidden]),select,textarea,[role=button],[role=switch],[role=tab]'
        for (const el of Array.from(document.querySelectorAll(selector))) {
          const rect = el.getBoundingClientRect()
          if (rect.width === 0 || rect.height === 0) continue
          const styles = getComputedStyle(el)
          if (styles.visibility === 'hidden' || styles.opacity === '0') continue
          const className = String(el.className)
          if (className.includes('sr-only')) continue
          // Inline-in-text exemption.
          if (el.tagName === 'A' && PROSE.includes(el.parentElement?.tagName ?? '')) continue
          if (rect.width < 24 || rect.height < 24) {
            found.push(
              `<${el.tagName.toLowerCase()}> ${Math.round(rect.width)}x${Math.round(rect.height)} "${(el.textContent ?? '').trim().slice(0, 30)}"`,
            )
          }
        }
        return found
      })

      expect(undersized, `${route} has targets under 24x24`).toEqual([])
    })
  }
})
