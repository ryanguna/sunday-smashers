import { test, expect, type Page } from '@playwright/test'

/**
 * Every route a guest can reach without signing in. Kept here rather than
 * imported from `src/lib/site.ts` so the e2e suite fails loudly if a page is
 * deleted, instead of silently shrinking along with the app's own list.
 */
const PUBLIC_ROUTES = [
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
  '/signup',
] as const

/**
 * Role-gated routes. In demo mode (no Supabase env vars) these render sample
 * data rather than redirecting, which is what makes them testable in CI — and
 * what an earlier bug broke by making the whole admin console unreachable.
 */
const GATED_ROUTES = [
  '/dashboard',
  '/admin',
  '/admin/checklist',
  '/admin/teams',
  '/admin/matches',
  '/scoring',
  '/tabulator',
  '/scoresheets',
] as const

/**
 * Vercel's analytics and speed-insights scripts are injected by the layout but
 * only served by Vercel's edge network. Under `next start` — which is how CI
 * runs these tests — they 404, which is expected infrastructure noise rather
 * than an application fault. Everything else must be silent.
 */
const IGNORED_REQUEST_PREFIXES = ['/_vercel/']

/** Collects page errors and console errors so a test can assert none occurred. */
function watchForErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return
    const source = msg.location()?.url ?? ''
    if (IGNORED_REQUEST_PREFIXES.some((prefix) => source.includes(prefix))) return
    errors.push(`${msg.text()} (${source})`)
  })
  page.on('pageerror', (err) => errors.push(err.message))
  return errors
}

test.describe('public routes', () => {
  for (const route of PUBLIC_ROUTES) {
    test(`${route} renders cleanly`, async ({ page }) => {
      const errors = watchForErrors(page)
      const response = await page.goto(route)

      expect(response?.status(), `${route} should return 200`).toBe(200)
      await expect(page).toHaveTitle(/.+/)

      // A page with a heading is a page that actually rendered content, as
      // opposed to an empty shell that still returns 200.
      await expect(page.locator('h1').first()).toBeVisible()
      expect(errors, `${route} logged console errors`).toEqual([])
    })
  }
})

test.describe('gated routes in demo mode', () => {
  for (const route of GATED_ROUTES) {
    test(`${route} renders sample data`, async ({ page }) => {
      const errors = watchForErrors(page)
      const response = await page.goto(route)

      expect(response?.status(), `${route} should return 200`).toBe(200)
      await expect(page.locator('h1').first()).toBeVisible()
      expect(errors, `${route} logged console errors`).toEqual([])
    })
  }
})

test.describe('layout', () => {
  // Players, umpires and scoresheet officials are all on phones in a gym, so a
  // page that scrolls sideways is a real defect rather than a cosmetic one.
  for (const route of ['/', '/schedule', '/standings', '/live', '/players', '/dashboard'] as const) {
    test(`${route} does not scroll sideways on a phone`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 })
      await page.goto(route)
      await page.waitForTimeout(300)

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      )
      expect(overflow, `${route} overflows horizontally by ${overflow}px`).toBeLessThanOrEqual(1)
    })
  }
})

test.describe('mobile menu', () => {
  // Reported from an iPhone: tapping the burger opened the menu *behind* the
  // page content. The cause was `backdrop-filter` on the header, which makes
  // the header a containing block for `position: fixed` descendants, so the
  // panel's `inset-0` measured against the ~65px header strip instead of the
  // viewport. These assertions fail if the panel ever goes back inside it.
  test('the burger menu escapes the header, so it can paint over the page', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/')
    await page.getByRole('button', { name: 'Open menu' }).click()

    const panel = page.getByRole('dialog', { name: 'Mobile navigation' })
    await expect(panel).toBeVisible()

    // This asserts the *cause*, not the symptom, and deliberately so: headless
    // Chromium reports `backdrop-filter: none` because it needs GPU
    // compositing, so it cannot reproduce what an iPhone does. What it can
    // check is the structural rule that produced the bug — a `fixed` overlay
    // must not be a descendant of an element that creates a containing block
    // for fixed positioning. The header does, via `bg-frost-glass`.
    const escaped = await page.evaluate(() => {
      const overlay = document.querySelector('[role="presentation"]')
      const header = document.querySelector('header')
      if (!overlay || !header) return null
      return {
        insideHeader: header.contains(overlay),
        parentIsBody: overlay.parentElement === document.body,
        headerHasBackdrop: header.classList.contains('bg-frost-glass'),
      }
    })

    // If this ever fails, `bg-frost-glass` moved and the reasoning above needs
    // rechecking before the test is relaxed.
    expect(escaped?.headerHasBackdrop, 'header no longer uses bg-frost-glass').toBe(true)
    expect(escaped?.insideHeader, 'the menu is trapped inside the blurred header').toBe(false)
    expect(escaped?.parentIsBody).toBe(true)

    // Belt and braces: whatever the finger lands on mid-panel must be the panel.
    const box = (await panel.boundingBox())!
    const onTop = await page.evaluate(
      ([x, y]) => Boolean(document.elementFromPoint(x, y)?.closest('[role="dialog"]')),
      [box.x + box.width / 2, box.y + box.height / 2] as const,
    )
    expect(onTop, 'something is painting over the open mobile menu').toBe(true)
  })

  test('the menu clears the header instead of hiding under it', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/')
    await page.getByRole('button', { name: 'Open menu' }).click()

    // The old code hardcoded `top: 61px` while the real header is taller, so
    // the overlay's blur crept over the logo. Measure both and compare.
    const { headerBottom, overlayTop } = await page.evaluate(() => {
      const header = document.querySelector('header')!
      const overlay = document.querySelector('[role="presentation"]')!
      return {
        headerBottom: header.getBoundingClientRect().bottom,
        overlayTop: overlay.getBoundingClientRect().top,
      }
    })
    expect(Math.abs(overlayTop - headerBottom)).toBeLessThanOrEqual(1)
  })
})

test('modals render outside the page, so a blurred card cannot trap them', async ({ page }) => {
  // Same defect class as the mobile menu: any ancestor with `backdrop-filter`,
  // `filter` or `transform` becomes the containing block for a `fixed` child,
  // which is how the header trapped its own menu. `Modal` has fourteen call
  // sites, so it portals to <body> instead of trusting every one of them.
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/gallery')
  await page.getByRole('button', { name: /^Open photo 1/ }).click()

  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()

  const parentIsBody = await page.evaluate(() => {
    const overlay = document.querySelector('[role="presentation"]')
    return overlay?.parentElement === document.body
  })
  expect(parentIsBody, 'the modal is nested in the page instead of portalled').toBe(true)
})

test('the courtside TV view stays public', async ({ page }) => {
  // The TV view runs unattended for hours on a monitor with nobody logged in.
  // If it ever starts redirecting to login, match day breaks.
  const response = await page.goto('/tv/court-1')
  expect(response?.status()).toBe(200)
  expect(page.url()).toContain('/tv/court-1')
})

test('404s land on the festive not-found page rather than a stack trace', async ({ page }) => {
  const response = await page.goto('/this-page-does-not-exist')
  expect(response?.status()).toBe(404)
  await expect(page.getByRole('heading', { level: 1 })).toContainText('404')
})
