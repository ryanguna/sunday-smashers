import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The Supabase Auth email templates live as HTML files because they get pasted
 * into a dashboard, not imported by the app. Nothing in the build touches them,
 * so nothing would notice if one drifted out of shape.
 *
 * These tests cover the failure modes that are invisible until a real player
 * gets a broken email: a shell that diverged between templates, a variable the
 * app cannot honour, or styling that silently collapses in Outlook.
 */

const TEMPLATE_DIR = path.join(process.cwd(), 'supabase', 'templates')

const TEMPLATE_NAMES = [
  'confirm-signup',
  'magic-link',
  'reset-password',
  'invite-user',
  'change-email',
] as const

const templates = TEMPLATE_NAMES.map((name) => ({
  name,
  file: `${name}.html`,
  html: readFileSync(path.join(TEMPLATE_DIR, `${name}.html`), 'utf8'),
}))

function block(html: string, marker: string): string {
  const match = html.match(
    new RegExp(`<!-- ${marker}:start -->([\\s\\S]*?)<!-- ${marker}:end -->`),
  )
  if (!match) throw new Error(`missing ${marker} block`)
  return match[1]
}

describe('email templates', () => {
  it.each(templates)('$file is present and non-trivial', ({ html }) => {
    expect(html.length).toBeGreaterThan(1000)
  })

  describe('shared shell stays shared', () => {
    // Five copies of the same masthead is exactly the shape of drift this
    // project keeps producing: someone updates one and the other four quietly
    // disagree. Fail loudly instead.
    it.each(['masthead', 'footer'])('%s is byte-identical everywhere', (marker) => {
      const variants = new Set(templates.map((t) => block(t.html, marker)))
      expect(variants.size).toBe(1)
    })
  })

  describe('links the app can actually honour', () => {
    it.each(templates)('$file sends the reader to ConfirmationURL', ({ html }) => {
      expect(html).toContain('href="{{ .ConfirmationURL }}"')
    })

    it.each(templates)('$file repeats the URL as copyable text', ({ html }) => {
      // Corporate gateways rewrite or strip buttons; the bare URL is the escape
      // hatch. Once for the button, once as visible text.
      const occurrences = html.split('{{ .ConfirmationURL }}').length - 1
      expect(occurrences).toBeGreaterThanOrEqual(2)
    })

    it.each(templates)('$file offers no OTP the app cannot accept', ({ html }) => {
      // There is no screen anywhere in this app that accepts a typed code, so
      // printing one would hand the player a number and nowhere to put it.
      expect(html).not.toContain('{{ .Token }}')
    })

    it.each(templates)('$file does not hand-build a TokenHash link', ({ html }) => {
      // /auth/callback does a PKCE code exchange. A TokenHash link would need a
      // verify route that does not exist.
      expect(html).not.toContain('{{ .TokenHash }}')
    })
  })

  describe('renders outside a browser engine', () => {
    it.each(templates)('$file uses no CSS custom properties', ({ html }) => {
      // globals.css tokens do not exist here — var() resolves to nothing and
      // the text renders black on white at best, invisible at worst.
      expect(html).not.toContain('var(--')
    })

    it.each(templates)('$file uses no layout no email client supports', ({ html }) => {
      expect(html).not.toMatch(/display\s*:\s*(flex|grid)/)
    })

    it.each(templates)('$file relies on no stylesheet or classes', ({ html }) => {
      // Gmail strips <style> in some contexts and Outlook.com rewrites class
      // names, so everything has to be inline.
      expect(html).not.toMatch(/<style[\s>]/i)
      expect(html).not.toMatch(/\sclass="/)
    })

    it.each(templates)('$file loads no remote images', ({ html }) => {
      // Most clients block remote images by default, and a broken image in a
      // confirmation email reads as phishing.
      expect(html).not.toMatch(/<img[\s>]/i)
    })

    it.each(templates)('$file stays under the Gmail clipping limit', ({ html }) => {
      expect(Buffer.byteLength(html, 'utf8')).toBeLessThan(102 * 1024)
    })
  })

  describe('readable by everyone', () => {
    it.each(templates)('$file never sets text in brand pink', ({ html }) => {
      // #ff8fc7 is 2.09:1 on white. It is decoration in the garland only, so
      // background-color is fine and the text `color` property is not.
      expect(html).not.toMatch(/(?<!background-)color:\s*#ff8fc7/i)
    })

    it.each(templates)('$file declares a light colour scheme', ({ html }) => {
      // Without this, dark-mode clients invert the palette and the deep plum
      // masthead can end up with near-invisible text.
      expect(html).toContain('name="color-scheme"')
    })

    it.each(templates)('$file sets the mobile viewport', ({ html }) => {
      expect(html).toContain('name="viewport"')
    })
  })

  describe('inbox preview', () => {
    const preheaders = templates.map(({ name, html }) => {
      const match = html.match(/mso-hide:all;[^"]*">([^<]+)</)
      return { name, text: match?.[1] ?? '' }
    })

    it.each(preheaders)('$name has preheader text', ({ text }) => {
      expect(text.trim().length).toBeGreaterThan(10)
    })

    it('every preheader is distinct', () => {
      // Otherwise the inbox shows five identical previews and a player cannot
      // tell a sign-in link from a password reset without opening both.
      expect(new Set(preheaders.map((p) => p.text)).size).toBe(preheaders.length)
    })
  })

  describe('documentation', () => {
    const readme = readFileSync(path.join(TEMPLATE_DIR, 'README.md'), 'utf8')

    it.each(templates)('README tells the committee where $file goes', ({ file }) => {
      expect(readme).toContain(file)
    })

    it('README states these are pasted into Supabase, not Mailgun', () => {
      expect(readme).toMatch(/not Mailgun/i)
    })
  })

  describe('content that would go stale', () => {
    it.each(templates)('$file quotes no tournament date', ({ html }) => {
      // Dates are configurable tournament settings the templates cannot read.
      // Any date baked in here is a copy that silently rots if organisers move
      // the event.
      expect(html).not.toMatch(/\b20\d\d\b/)
      expect(html).not.toMatch(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\b/)
    })
  })
})
