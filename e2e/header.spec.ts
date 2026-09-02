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
 */
test.describe('landmarks', () => {
  for (const path of ['/', '/rules', '/announcements', '/register', '/pay']) {
    test(`${path} has exactly one main landmark`, async ({ page }) => {
      await page.goto(path)
      await expect(page.locator('main')).toHaveCount(1)
    })
  }
})
