import { test, expect } from '@playwright/test'

// Placeholder smoke test. The homepage is under active development by
// another workstream, so this deliberately avoids asserting on specific
// copy or markup — it only checks that the app boots and renders a page.
test('home page loads', async ({ page }) => {
  const response = await page.goto('/')

  expect(response?.ok()).toBeTruthy()
  await expect(page.locator('body')).toBeVisible()
  await expect(page).toHaveTitle(/.+/)
})
