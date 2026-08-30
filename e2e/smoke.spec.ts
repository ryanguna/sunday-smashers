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

/** Collects page errors and console errors so a test can assert none occurred. */
function watchForErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
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
