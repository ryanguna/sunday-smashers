import { expect, test } from '@playwright/test'

/**
 * Brand rendering guarantees.
 *
 * These are all things that only exist once the CSS has actually cascaded, so
 * neither `tsc`, `eslint` nor the unit suite can see them. Each test here
 * corresponds to a defect that shipped:
 *
 *  1. `h1, h2, ... { color: var(--color-plum) }` sat *outside* a cascade layer.
 *     Tailwind v4 puts utilities in `@layer utilities`, and unlayered CSS beats
 *     every layer regardless of specificity, so `text-transparent` lost. The
 *     landing page's main headline rendered as flat plum with the rainbow
 *     gradient painted behind fully opaque text. It looked deliberate, so it
 *     went unnoticed.
 *
 *  2. Fixing (1) exposed the opposite problem: `--gradient-candy` is a pastel
 *     sweep meant to sit *behind* navy type. Clipped to letterforms on the page
 *     wash it measures about 1.8:1. axe cannot catch either state — it skips
 *     elements whose computed colour is transparent.
 *
 *  3. The header and hero render real logo files. A `src` pointing at a missing
 *     file still builds, still passes lint, and simply 404s in the browser.
 */

/** Relative luminance per WCAG 2.x. */
function luminance([r, g, b]: number[]): number {
  const f = (c: number) => {
    const v = c / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}

function contrast(a: number[], b: number[]): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

test.describe('brand rendering', () => {
  test('the hero headline paints its gradient rather than a flat fill', async ({ page }) => {
    await page.goto('/')

    const styles = await page.locator('h1').first().evaluate((el) => {
      const s = getComputedStyle(el)
      return {
        fill: s.webkitTextFillColor || s.color,
        backgroundImage: s.backgroundImage,
        backgroundClip: s.backgroundClip || s.webkitBackgroundClip,
      }
    })

    // A gradient clipped to text is only visible when the glyph fill is
    // transparent. Any opaque fill means the gradient is being painted and
    // then completely covered up.
    expect(styles.backgroundClip).toBe('text')
    expect(styles.backgroundImage).toContain('linear-gradient')
    expect(styles.fill).toMatch(/rgba\(0,\s*0,\s*0,\s*0\)|transparent/)
  })

  test('the hero headline stays legible against the page wash', async ({ page }) => {
    await page.goto('/')

    const { stops, background } = await page.locator('h1').first().evaluate((el) => {
      const image = getComputedStyle(el).backgroundImage
      // Computed style always resolves colours to rgb()/rgba(), whatever the
      // author wrote, so parsing these is stable across browsers.
      const stops = [...image.matchAll(/rgba?\(([^)]+)\)/g)].map(([, body]) =>
        body.split(',').slice(0, 3).map((n) => Number(n.trim()))
      )
      // Walk up for the first ancestor that actually paints an opaque colour,
      // so the comparison uses what is really behind the text.
      let node: HTMLElement | null = el as HTMLElement
      let background = [255, 255, 255]
      while (node) {
        const bg = getComputedStyle(node).backgroundColor
        const parts = bg.match(/rgba?\(([^)]+)\)/)
        if (parts) {
          const values = parts[1].split(',').map((n) => Number(n.trim()))
          if (values.length < 4 || values[3] > 0.9) {
            background = values.slice(0, 3)
            break
          }
        }
        node = node.parentElement
      }
      return { stops, background }
    })

    // Guard the guard: if the gradient ever stops resolving to colour stops,
    // an empty list would make the assertion below vacuously true.
    expect(stops.length).toBeGreaterThanOrEqual(3)

    for (const stop of stops) {
      expect(
        contrast(stop, background),
        `gradient stop rgb(${stop.join(', ')}) on rgb(${background.join(', ')})`
      ).toBeGreaterThanOrEqual(4.5)
    }
  })

  test('the header and hero logos load', async ({ page }) => {
    const failed: string[] = []
    page.on('response', (r) => {
      if (r.url().includes('/brand/') && r.status() >= 400) failed.push(`${r.status()} ${r.url()}`)
    })

    await page.goto('/', { waitUntil: 'networkidle' })

    // Both logo files must actually decode, not just be referenced.
    const broken = await page.evaluate(() =>
      [...document.querySelectorAll('img')]
        .filter((img) => img.complete && img.naturalWidth === 0)
        .map((img) => img.currentSrc || img.src)
    )

    expect(failed).toEqual([])
    expect(broken).toEqual([])
  })
})
