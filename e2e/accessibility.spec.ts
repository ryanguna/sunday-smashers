import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

/**
 * Accessibility gates.
 *
 * Both of the regressions these cover were completely invisible to the unit
 * suite: a palette where the pastel "-dark" text tokens failed contrast on
 * their own tinted backgrounds (769 violations), and a `prefers-reduced-motion`
 * block written as an allowlist of our own animation classes, which therefore
 * missed Tailwind's built-in `animate-pulse` and every CSS transition. Neither
 * is detectable without a real browser, so they live here.
 */

const AXE_SOURCE = fs.readFileSync(
  path.join(process.cwd(), 'node_modules/axe-core/axe.min.js'),
  'utf8',
)

/** A representative route per surface: public, admin, player, umpire, courtside. */
const AUDITED_ROUTES = [
  '/',
  '/rules',
  '/schedule',
  '/standings',
  '/bracket',
  '/live',
  '/players',
  '/awards',
  '/gallery',
  '/announcements',
  '/register',
  '/login',
  '/dashboard',
  '/admin',
  '/admin/checklist',
  '/admin/teams',
  '/admin/matches',
  '/scoring',
  '/tv/court-1',
] as const

interface AxeNode {
  html: string
  any: { message: string }[]
}
interface AxeViolation {
  id: string
  impact: string | null
  help: string
  nodes: AxeNode[]
}

declare global {
  interface Window {
    axe: {
      run: (
        ctx: Document,
        opts: { runOnly: { type: string; values: string[] } },
      ) => Promise<{ violations: AxeViolation[] }>
    }
  }
}

test.describe('WCAG 2 AA', () => {
  // Both projects run Chromium and axe's colour maths is viewport-independent,
  // so running the audit twice per route would just double CI time for an
  // identical result. Gate on the built-in `isMobile` fixture.
  test.skip(({ isMobile }) => isMobile, 'audit runs once, on the desktop project')

  for (const route of AUDITED_ROUTES) {
    test(`${route} has no serious or critical violations`, async ({ page }) => {
      await page.goto(route, { waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(500)
      await page.addScriptTag({ content: AXE_SOURCE })

      const result = await page.evaluate(
        async () =>
          await window.axe.run(document, {
            runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] },
          }),
      )

      const serious = result.violations.filter(
        (v) => v.impact === 'serious' || v.impact === 'critical',
      )

      // Report the offending markup and the measured ratio, not just a count —
      // a bare "3 violations" is not enough to act on.
      const detail = serious
        .flatMap((v) =>
          v.nodes.map((n) => `  [${v.id}] ${n.any[0]?.message ?? v.help}\n    ${n.html.slice(0, 160)}`),
        )
        .join('\n')

      expect(serious, `${route}:\n${detail}`).toHaveLength(0)
    })
  }
})

test.describe('prefers-reduced-motion', () => {
  test.skip(({ isMobile }) => isMobile, 'motion audit runs once, on the desktop project')

  // Falling snow, drifting shuttlecocks, confetti, shimmering headlines and an
  // animated scoreboard are core to the festive feel — and all of them must
  // stop dead for anyone who asks for reduced motion.
  for (const route of ['/', '/live', '/dashboard', '/gallery', '/tv/court-1'] as const) {
    test(`${route} holds still`, async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await page.goto(route, { waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(500)

      const moving = await page.evaluate(() => {
        // "0.01ms" parses as 0.01 and would read as "moving" without unit
        // handling; and `s` vs `ms` differ by a factor of a thousand.
        const toMs = (value: string) => {
          const raw = value.split(',')[0].trim()
          const n = parseFloat(raw)
          if (Number.isNaN(n)) return 0
          return raw.endsWith('ms') ? n : n * 1000
        }

        const offenders: string[] = []
        for (const el of Array.from(document.querySelectorAll('*'))) {
          const s = getComputedStyle(el)
          const animated = s.animationName !== 'none' && toMs(s.animationDuration) > 1
          const transitioned = toMs(s.transitionDuration) > 1
          if (animated || transitioned) {
            offenders.push(
              `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 60)} ` +
                `anim=${s.animationName}/${s.animationDuration} trans=${s.transitionDuration}`,
            )
          }
        }
        return offenders.slice(0, 10)
      })

      expect(moving, `${route} still animates under reduced motion`).toEqual([])
    })
  }
})
