import type { UserRole } from '@/lib/supabase/types'

/**
 * The one place the site-wide header and footer agree on where you can go.
 *
 * `SiteHeader`, its mobile panel, `SiteHeaderAuth` and `SiteFooter` all read
 * these lists — restating a route in a second file is how links quietly drift
 * out of sync (and how `/announcements` ended up reachable only by typing the
 * URL). Everything here is pure and dependency-free so `./site-nav.test.ts`
 * can cover it without a browser or a Supabase connection.
 */

export interface NavLink {
  href: string
  label: string
}

/** Primary navigation — desktop header and mobile panel render the same list. */
export const NAV_LINKS: readonly NavLink[] = [
  { href: '/', label: 'Home' },
  { href: '/rules', label: 'Rules' },
  { href: '/schedule', label: 'Schedule' },
  { href: '/standings', label: 'Standings' },
  { href: '/live', label: 'Live' },
  { href: '/announcements', label: 'Announcements' },
  { href: '/players', label: 'Players' },
  { href: '/awards', label: 'Awards' },
  { href: '/gallery', label: 'Gallery' },
]

/** Footer navigation — the primary links plus the ones the header keeps as a CTA. */
export const FOOTER_LINKS: readonly NavLink[] = [
  { href: '/rules', label: 'Rules' },
  { href: '/schedule', label: 'Schedule' },
  { href: '/standings', label: 'Standings' },
  { href: '/bracket', label: 'Bracket' },
  { href: '/live', label: 'Live' },
  { href: '/announcements', label: 'Announcements' },
  { href: '/players', label: 'Players' },
  { href: '/awards', label: 'Awards' },
  { href: '/gallery', label: 'Gallery' },
  { href: '/register', label: 'Register' },
  { href: '/dashboard', label: 'My dashboard' },
]

/**
 * What the account area of the header should render.
 *
 * - `pending` — Supabase is configured but the session hasn't resolved yet
 *   (the header is a Client Component, so this is also what the server-rendered
 *   HTML contains). It still offers a working link, never a dead skeleton.
 * - `demo`   — no Supabase env vars. Every guarded page renders sample data for
 *   a stand-in organiser (see `requireAuth` in `src/lib/auth.ts`), so the header
 *   shows the player routes but no sign-in/sign-out control, because there is no
 *   auth system to sign in or out of.
 */
export type AccountNavState = 'pending' | 'demo' | 'signed-in' | 'signed-out'

export function accountNavState(input: {
  configured: boolean
  loading: boolean
  signedIn: boolean
}): AccountNavState {
  if (!input.configured) return 'demo'
  if (input.loading) return 'pending'
  return input.signedIn ? 'signed-in' : 'signed-out'
}

/** Where each granted role's console lives. Order = order shown in the header. */
const ROLE_LINKS: readonly { role: UserRole; link: NavLink }[] = [
  { role: 'duty_official', link: { href: '/scoring', label: 'Scoring' } },
  { role: 'tabulator', link: { href: '/tabulator', label: 'Tabulator' } },
  { role: 'admin', link: { href: '/admin', label: 'Organiser' } },
]

/**
 * The signed-in player's routes: always their dashboard, plus a console for any
 * role they hold.
 *
 * Roles arrive free with `useAuth()`, which already fetches them — so this costs
 * no extra query per page. Per-match officiating duty is deliberately NOT
 * computed here: `buildPlayerDashboard` in `src/lib/dashboard.ts` needs the whole
 * schedule, division list and duty roster to answer "am I on duty?", which is far
 * too much work to repeat in the header on every page. `/dashboard` already
 * surfaces the next duty, so we link there instead.
 */
export function accountLinks(roles: readonly UserRole[]): NavLink[] {
  return [
    { href: '/dashboard', label: 'My dashboard' },
    ...ROLE_LINKS.filter(({ role }) => roles.includes(role)).map(({ link }) => link),
    // Last, below the role consoles: needed rarely, but it is the only place
    // in the app that can change a password, so it must be findable without
    // asking someone. Ordered after the consoles so a one-off account chore
    // never sits above the thing an organiser opens every match day.
    { href: '/account/password', label: 'Change password' },
  ]
}

/**
 * Should the header show its standalone "Register" call to action?
 *
 * The old answer was "always", which produced two complaints at once. A player
 * who had *just signed in* was still shown a big Register button, tapped it,
 * and was asked to create an account — so the button read as broken. And once
 * registration closes, or before the committee has opened it, the button
 * advertised a page that could not accept them.
 *
 * The rule now:
 *
 *  - **Hidden** when the committee has switched `/register` off. A CTA for a
 *    page that renders "not open yet" is worse than no CTA.
 *  - **Hidden** when someone is signed in. Everything personal — including
 *    their entry — lives behind the avatar menu and on their dashboard, so a
 *    second, competing entry point is just noise. This is the specific fix for
 *    "the register button is always there, it's even confusing".
 *  - **Shown** otherwise, including while the session is still resolving.
 *    Signed-out is by far the common case for a public teaser site, and the
 *    button is the whole point of the page; withholding it until JavaScript
 *    lands would cost far more than the brief flash a signed-in visitor sees.
 */
export function shouldShowRegisterCta(input: {
  accountState: AccountNavState
  registerPageVisible: boolean
}): boolean {
  if (!input.registerPageVisible) return false
  return input.accountState !== 'signed-in'
}

/** "Signed in as …" copy: the player's name when we have it, otherwise their email. */
export function accountDisplayName(
  fullName: string | null | undefined,
  email: string | null | undefined,
): string {
  const name = fullName?.trim()
  if (name) return name
  const address = email?.trim()
  if (address) return address
  return 'your account'
}
