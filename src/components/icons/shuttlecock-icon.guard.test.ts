import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * `public/brand/icon-shuttlecock.png` is the prettier artwork, and swapping the
 * icon over to it is a tempting one-line change. It would break the app in ways
 * that are easy to miss in review, so the reasons are pinned here.
 *
 * The icon is rendered ~150 times and is recoloured by its call sites through
 * `currentColor` -- white inside `EmptyState`'s mint gradient circle, gold on
 * the courtside TV view, tinted pink at low opacity in `Snowfall`. A raster
 * cannot follow text colour. It is also drawn as small as `size={14}` inline in
 * badges and as large as `h-[8vh]` on a gym monitor, where a 161x155 PNG would
 * be mud at one end and blurred at the other.
 */
const SOURCE = readFileSync(
  path.resolve(__dirname, 'ShuttlecockIcon.tsx'),
  'utf8'
)

/** The file documents why it is not the PNG, so comments must not be scanned. */
const CODE = SOURCE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')

describe('ShuttlecockIcon stays a recolourable vector', () => {
  it('draws an inline svg rather than embedding a raster asset', () => {
    expect(CODE).toContain('<svg')
    expect(CODE).not.toMatch(/<Image\b/)
    expect(CODE).not.toMatch(/<img\b/)
    expect(CODE).not.toMatch(/\.(png|jpe?g|webp|avif)\b/i)
  })

  it('takes its colour from the call site instead of hardcoding one', () => {
    expect(CODE).toContain('iconBaseProps')
    const explicitColours = CODE.match(
      /(?:fill|stroke)=["'](?!currentColor|none)[^"']+["']/g
    )
    expect(explicitColours).toBeNull()
  })

  it('keeps every drawn coordinate inside the 24x24 viewBox', () => {
    const strokeWidth = Number(
      /iconBaseProps\(props,\s*24,\s*([\d.]+)\)/.exec(CODE)?.[1]
    )
    expect(strokeWidth).toBeGreaterThan(0)
    const bleed = strokeWidth / 2

    // Every number in a `d="..."` is an absolute-ish coordinate or a radius;
    // none of them may sit so close to an edge that the stroke clips.
    const points: number[] = []
    for (const [, d] of CODE.matchAll(/\sd="([^"]+)"/g)) {
      for (const n of d.match(/-?\d*\.?\d+/g) ?? []) points.push(Math.abs(Number(n)))
    }
    const circle = /<circle cx="([\d.]+)" cy="([\d.]+)" r="([\d.]+)"/.exec(CODE)
    expect(circle).not.toBeNull()
    const [, cx, cy, r] = circle!.map(Number)
    points.push(cx + r, cy + r)

    expect(points.length).toBeGreaterThan(0)
    for (const value of points) {
      expect(value).toBeLessThanOrEqual(24 - bleed)
    }
    expect(cx - r).toBeGreaterThanOrEqual(bleed)
    expect(cy - r).toBeGreaterThanOrEqual(bleed)
  })
})
