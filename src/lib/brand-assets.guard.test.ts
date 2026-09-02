import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Guards the brand asset wiring.
 *
 * Two real defects motivated this file:
 *
 *  1. When the official kit landed, four poster-derived icons
 *     (`/icon-192.png`, `/icon-512.png`, `/icon-maskable-512.png`,
 *      `/sunday-smashers-logo.jpg`) were deleted from `public/`. Nothing in
 *     the build fails when a `src` string points at a file that no longer
 *     exists — Next serves a 404 and the page renders with a broken image.
 *     `tsc`, `lint` and the unit suite were all green with the icons missing.
 *
 *  2. `logo-primary.png` shipped from the kit with the style board's own
 *     caption baked into the top-left corner, despite the kit README stating
 *     that board labels are excluded. It was used at hero size and in the
 *     social card before anyone looked at it closely.
 *
 * So: every `/brand/...` path referenced in source must resolve to a real
 * file, and no source file may reference the retired assets.
 */

const ROOT = resolve(__dirname, '..', '..')
const PUBLIC = join(ROOT, 'public')

/** Every `.ts`/`.tsx` file under `src/`, excluding this test itself. */
function sourceFiles(dir = join(ROOT, 'src')): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) return sourceFiles(full)
    if (!/\.tsx?$/.test(entry)) return []
    if (full === __filename) return []
    return [full]
  })
}

/** Source with comments stripped, so commentary about an asset isn't a reference. */
function code(file: string): string {
  return readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
}

describe('brand assets', () => {
  const files = sourceFiles()

  it('scans a meaningful number of source files', () => {
    // Without this, a broken glob would make every other test below pass by
    // finding nothing at all.
    expect(files.length).toBeGreaterThanOrEqual(100)
  })

  it('every referenced /brand asset exists in public/', () => {
    const missing: string[] = []
    let referenced = 0

    for (const file of files) {
      for (const [, path] of code(file).matchAll(/['"`](\/brand\/[\w.-]+)['"`]/g)) {
        referenced += 1
        if (!existsSync(join(PUBLIC, path))) missing.push(`${path} (${file.slice(ROOT.length + 1)})`)
      }
    }

    expect(referenced).toBeGreaterThanOrEqual(5)
    expect(missing).toEqual([])
  })

  it('does not reference the retired poster-derived icons', () => {
    // These were deleted when the official kit landed. A stale reference is a
    // 404 at runtime, which no other check in the pipeline catches.
    const retired = ['/sunday-smashers-logo.jpg', '/icon-192.png', '/icon-512.png']
    const offenders: string[] = []

    for (const file of files) {
      const body = code(file)
      for (const asset of retired) {
        if (body.includes(`"${asset}"`) || body.includes(`'${asset}'`)) {
          offenders.push(`${file.slice(ROOT.length + 1)} → ${asset}`)
        }
      }
    }

    expect(offenders).toEqual([])
  })

  it('ships a maskable icon that is distinct from the plain favicon', () => {
    // Android keeps only the inner 80% of a maskable icon. Pointing `maskable`
    // at favicon-512.png would slice through the badge's outline ring, so the
    // two must not be the same bytes.
    const favicon = readFileSync(join(PUBLIC, 'brand', 'favicon-512.png'))
    const maskable = readFileSync(join(PUBLIC, 'brand', 'icon-maskable-512.png'))
    expect(maskable.equals(favicon)).toBe(false)
  })
})
