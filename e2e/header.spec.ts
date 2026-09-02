import { expect, test } from '@playwright/test'

/**
 * One `<main>` per page, asserted **after hydration**.
 *
 * This has to be a DOM check rather than a check of the response body: the
 * streamed HTML briefly contains two, the `loading.tsx` fallback and the
 * streamed replacement sitting in a `<div hidden>`. React swaps them, so only
 * a live page has the real answer.
 *
 * Worth its own spec because `PageGate` supplies its own `<main>` on the
 * hidden branch, so wrapping a page incorrectly — leaving the page's `<main>`
 * *inside* the gate's — silently produces two landmarks and a screen reader
 * with no way to skip to content.
 *
 * The account corner cannot be covered here: the suite runs in demo mode,
 * where there is no auth system and the header deliberately shows the demo
 * state. That logic is unit-tested in `src/components/site-nav.test.ts`.
 *
 * Admin routes are included because they fail for a *different* reason:
 * `AdminShell` supplies the `<main>` for every console page, so a page that
 * also renders its own gets two. `/admin/announcements` did exactly that —
 * it was built with the public-page shell (`<main>` + `Snowfall`) instead of
 * the `AdminPageHeader` every sibling uses. Demo mode hands out a stand-in
 * admin identity, so these routes render here without a login.
 */
test.describe('landmarks', () => {
  const paths = [
    '/',
    '/rules',
    '/announcements',
    '/register',
    '/pay',
    '/admin',
    '/admin/announcements',
    '/admin/settings',
    '/admin/registrations',
  ]

  for (const path of paths) {
    test(`${path} has exactly one main landmark`, async ({ page }) => {
      await page.goto(path)
      await expect(page.locator('main')).toHaveCount(1)
    })
  }

  // A page with no h1 leaves screen-reader users without a title, and the
  // announcements composer shipped without one because `SectionHeading`
  // defaults to level 2.
  for (const path of ['/', '/rules', '/admin', '/admin/announcements']) {
    test(`${path} has exactly one h1`, async ({ page }) => {
      await page.goto(path)
      await expect(page.locator('h1')).toHaveCount(1)
    })
  }
})
