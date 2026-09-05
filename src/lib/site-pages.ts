import type { NavLink } from '@/components/site-nav'

/**
 * The catalogue of public pages the committee can switch on and off, and the
 * pure logic for deciding what a given visitor may see.
 *
 * ## Why this exists
 *
 * The site is built for the whole tournament lifecycle — schedule, standings,
 * live scores, brackets, awards, gallery — but on the day pre-registration
 * opens, none of that exists yet. A visitor clicking "Standings" three months
 * early gets an empty table and reasonably concludes the site is broken. The
 * committee asked to be able to reveal pages as the tournament actually
 * reaches them.
 *
 * ## Why the catalogue is code but the switches are data
 *
 * A page cannot be *invented* from a database row — the route has to exist in
 * `src/app` — so the list of what is toggleable is a hard-coded catalogue here.
 * What is stored in Postgres (`public.site_page_visibility`) is only the
 * on/off state, so the committee changes it from the admin console without a
 * deploy. This is the same split the tournament rules use: structure in code,
 * settings in data.
 *
 * ## Why hidden pages are still routes
 *
 * Hiding is a *soft* gate, not a security boundary. Nothing behind these
 * pages is secret — the schedule is public the moment it exists — and the
 * data itself is already protected by RLS. So a hidden page renders a polite
 * "not open yet" panel rather than a 404: shareable links posted in the group
 * chat before launch still land somewhere sensible, and admins can preview
 * the real page while it is hidden from everyone else.
 *
 * Pure and dependency-free (no React, no Supabase, no `next/*`) so
 * `site-pages.test.ts` can cover every branch without a browser.
 */

/** Stable identifier for a toggleable page. Never change these — they are stored in the database. */
export type SitePageKey =
  | 'rules'
  | 'schedule'
  | 'standings'
  | 'bracket'
  | 'live'
  | 'announcements'
  | 'players'
  | 'awards'
  | 'gallery'
  | 'register'
  | 'pay'
  | 'tv'

export interface SitePage {
  key: SitePageKey
  /** The route this controls. Sub-routes are covered too — see `sitePageForPath`. */
  href: string
  /** Committee-facing name in the admin toggle list. */
  label: string
  /** Why the committee might want this on or off, in their language. */
  description: string
  /**
   * Which phase this normally belongs to. Purely for grouping the admin UI so
   * the list reads as a timeline rather than an arbitrary pile of switches.
   */
  phase: 'always' | 'pre-registration' | 'match-day' | 'after'
  /** Copy for the "not open yet" panel shown when the page is hidden. */
  hiddenTitle: string
  hiddenMessage: string
}

/**
 * Every page the committee can hide, in the order the admin console lists them.
 *
 * `/` is deliberately absent: a site whose front page can be switched off is a
 * site that can be switched off entirely, which is not a thing anyone needs and
 * would strand every visitor including the committee. The auth routes, the
 * player dashboard and the admin console are absent for the same reason — they
 * are how people get in and how the committee fixes things.
 */
export const SITE_PAGES: readonly SitePage[] = [
  {
    key: 'register',
    href: '/register',
    label: 'Register',
    description: 'The pre-registration entry form.',
    phase: 'pre-registration',
    hiddenTitle: 'Registration isn’t open yet',
    hiddenMessage:
      'The committee hasn’t opened the entry sheet. Keep an eye on the front page — the countdown there is the real one 🎄',
  },
  {
    key: 'rules',
    href: '/rules',
    label: 'Rules & format',
    description: 'Scoring, format, eligibility and the code of conduct.',
    phase: 'pre-registration',
    hiddenTitle: 'The rules aren’t published yet',
    hiddenMessage:
      'The committee is still finalising the format. They’ll be up well before the first serve.',
  },
  {
    key: 'pay',
    href: '/pay',
    label: 'Pay your entry fee',
    description: 'Payment instructions and the player’s payment status.',
    phase: 'pre-registration',
    hiddenTitle: 'Payments aren’t open yet',
    hiddenMessage:
      'Hold on to your money for now — the committee will let everyone know when entry fees are due.',
  },
  {
    key: 'players',
    href: '/players',
    label: 'Players & teams',
    description: 'The player directory and public profiles.',
    phase: 'pre-registration',
    hiddenTitle: 'The player list isn’t public yet',
    hiddenMessage:
      'Entries are still coming in. The line-up goes up once the committee has confirmed who’s playing.',
  },
  {
    key: 'schedule',
    href: '/schedule',
    label: 'Schedule',
    description: 'Match times by court. Only useful once the draw is published.',
    phase: 'match-day',
    hiddenTitle: 'The schedule isn’t out yet',
    hiddenMessage:
      'Court times land once the draw is done. You’ll find them here — and on your dashboard — the moment they do.',
  },
  {
    key: 'bracket',
    href: '/bracket',
    label: 'Draw & bracket',
    description: 'The round-robin fixtures and the semis/finals tree.',
    phase: 'match-day',
    hiddenTitle: 'The draw hasn’t been made yet',
    hiddenMessage: 'Nobody knows who’s playing who — including us. Check back after entries close.',
  },
  {
    key: 'standings',
    href: '/standings',
    label: 'Standings',
    description: 'Win/loss tables and qualification for the semis.',
    phase: 'match-day',
    hiddenTitle: 'There’s nothing to rank yet',
    hiddenMessage: 'Standings appear once the first games have been played and tabulated.',
  },
  {
    key: 'live',
    href: '/live',
    label: 'Live scores',
    description: 'Realtime match cards. Only meaningful on tournament day.',
    phase: 'match-day',
    hiddenTitle: 'No shuttles in the air yet',
    hiddenMessage: 'Live scores switch on when play starts. Until then it’s very quiet in here.',
  },
  {
    key: 'tv',
    href: '/tv',
    label: 'Courtside TV view',
    description: 'The full-screen scoreboard for the monitor in the hall.',
    phase: 'match-day',
    hiddenTitle: 'The courtside display is off',
    hiddenMessage: 'The scoreboard goes live on tournament day.',
  },
  {
    key: 'announcements',
    href: '/announcements',
    label: 'Announcements',
    description: 'The notice board. Worth leaving on — it’s how you reach everyone.',
    phase: 'always',
    hiddenTitle: 'No notices yet',
    hiddenMessage: 'The committee hasn’t opened the notice board. Nothing to miss just yet.',
  },
  {
    key: 'awards',
    href: '/awards',
    label: 'Awards',
    description: 'Champions, runners-up and the festive extras.',
    phase: 'after',
    hiddenTitle: 'The trophies are still in the box',
    hiddenMessage: 'Awards are revealed after the final. No peeking 🎁',
  },
  {
    key: 'gallery',
    href: '/gallery',
    label: 'Photo gallery',
    description: 'Match-day photos.',
    phase: 'after',
    hiddenTitle: 'No photos yet',
    hiddenMessage: 'The gallery fills up on the day. Bring a camera.',
  },
]

/** Fast lookup by key. */
const BY_KEY = new Map<SitePageKey, SitePage>(SITE_PAGES.map((page) => [page.key, page]))

export function sitePageByKey(key: SitePageKey): SitePage | undefined {
  return BY_KEY.get(key)
}

export function isSitePageKey(value: unknown): value is SitePageKey {
  return typeof value === 'string' && BY_KEY.has(value as SitePageKey)
}

/**
 * The committee's on/off switches, keyed by page. A key that is absent means
 * "never configured", which reads as **visible** — see `isPageVisible`.
 */
export type SitePageVisibility = Partial<Record<SitePageKey, boolean>>

/**
 * Is this page visible to an ordinary visitor?
 *
 * Absent keys default to **visible**, not hidden. This matters more than it
 * looks: the row is loaded over the network, and a failed load produces an
 * empty object. Defaulting to hidden would mean a momentary database blip
 * silently blanks the entire navigation — the site would look deleted. A blip
 * that shows a page slightly early is a far smaller problem than one that
 * hides everything, so the safe default is "show it".
 */
export function isPageVisible(
  visibility: SitePageVisibility | null | undefined,
  key: SitePageKey,
): boolean {
  return visibility?.[key] !== false
}

/**
 * Which catalogue entry, if any, governs this path.
 *
 * Prefix-matched so sub-routes are covered by their parent's switch:
 * `/players/holly` follows `/players`, `/tv/1` follows `/tv`, and
 * `/register/invites` follows `/register`. Matching is on a path *segment*
 * boundary so a future `/registerings` route could never be caught by
 * `/register`.
 *
 * The longest match wins, so adding a more specific entry later automatically
 * takes precedence over a broader one.
 */
export function sitePageForPath(pathname: string): SitePage | null {
  const path = normalisePath(pathname)
  let best: SitePage | null = null
  for (const page of SITE_PAGES) {
    if (path === page.href || path.startsWith(`${page.href}/`)) {
      if (!best || page.href.length > best.href.length) best = page
    }
  }
  return best
}

/** True when an ordinary visitor may open this path. Unlisted paths are always allowed. */
export function isPathVisible(
  visibility: SitePageVisibility | null | undefined,
  pathname: string,
): boolean {
  const page = sitePageForPath(pathname)
  return page ? isPageVisible(visibility, page.key) : true
}

/**
 * Drop the links a visitor shouldn't see.
 *
 * Used for both the header and the footer, so a hidden page can't survive in
 * one list after being removed from the other — the exact drift `site-nav.ts`
 * was written to prevent.
 */
export function visibleNavLinks<T extends NavLink>(
  links: readonly T[],
  visibility: SitePageVisibility | null | undefined,
): T[] {
  return links.filter((link) => isPathVisible(visibility, link.href))
}

/** Strips a trailing slash (except for the root) and any query or hash. */
function normalisePath(pathname: string): string {
  const path = pathname.split('?')[0].split('#')[0]
  if (path.length > 1 && path.endsWith('/')) return path.slice(0, -1)
  return path
}

/** Admin-console grouping, in tournament order. */
export const SITE_PAGE_PHASES: readonly { phase: SitePage['phase']; label: string; blurb: string }[] =
  [
    {
      phase: 'always',
      label: 'Always useful',
      blurb: 'Worth leaving switched on for the whole run-up.',
    },
    {
      phase: 'pre-registration',
      label: 'Sign-up season',
      blurb: 'Everything players need before the draw is made.',
    },
    {
      phase: 'match-day',
      label: 'Tournament day',
      blurb: 'Only meaningful once there are fixtures and scores.',
    },
    {
      phase: 'after',
      label: 'After the final',
      blurb: 'The victory lap — reveal these when there’s something to show.',
    },
  ]

/**
 * Field-level diff of two visibility maps, in the shape the settings save bar
 * already renders.
 *
 * Compares over the **catalogue**, not over the maps' own keys, so a stale row
 * for a page that has since been deleted from the code can never appear as a
 * phantom change the committee is asked to save.
 */
export function diffSitePageVisibility(
  saved: SitePageVisibility | null | undefined,
  draft: SitePageVisibility | null | undefined,
): { path: string; label: string; before: string; after: string }[] {
  const changes: { path: string; label: string; before: string; after: string }[] = []
  for (const page of SITE_PAGES) {
    const before = isPageVisible(saved, page.key)
    const after = isPageVisible(draft, page.key)
    if (before === after) continue
    changes.push({
      path: `pages.${page.key}`,
      label: page.label,
      before: before ? 'visible' : 'hidden',
      after: after ? 'visible' : 'hidden',
    })
  }
  return changes
}

/** Every catalogue key set explicitly, so the UI never renders an indeterminate switch. */
export function completeVisibility(
  visibility: SitePageVisibility | null | undefined,
): Record<SitePageKey, boolean> {
  const complete = {} as Record<SitePageKey, boolean>
  for (const page of SITE_PAGES) complete[page.key] = isPageVisible(visibility, page.key)
  return complete
}
