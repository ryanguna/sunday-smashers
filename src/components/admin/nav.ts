import type { ComponentType } from 'react'
import type { IconProps } from '@/components/icons/types'
import {
  BaubleIcon,
  GiftIcon,
  HollyIcon,
  MedalIcon,
  RacketIcon,
  ShuttlecockIcon,
  SnowflakeIcon,
  SparkleIcon,
  TrophyIcon,
} from '@/components/icons'

/**
 * THE single source of truth for the admin console's navigation.
 *
 * Other agents adding an admin section should **edit this array only** —
 * `AdminShell` renders both the desktop sidebar and the mobile drawer from
 * it, so a new entry automatically appears in both, with the correct active
 * state and mobile behaviour. Nothing else needs to change.
 *
 * Notes for editors:
 *  - `href` must start with `/admin`.
 *  - Nesting is derived from `href`, not from the array order: a link is
 *    "active" when the pathname equals it, or starts with it followed by
 *    `/` (the `/admin` root is matched exactly so it doesn't light up for
 *    every child route).
 *  - Keep `group` to one of the existing `ADMIN_NAV_GROUPS` values, or add
 *    a new group there *and* to that ordered array.
 */

export const ADMIN_NAV_GROUPS = ['Overview', 'People & money', 'Tournament day', 'Content'] as const

export type AdminNavGroup = (typeof ADMIN_NAV_GROUPS)[number]

export interface AdminNavItem {
  href: string
  label: string
  /** One-line explanation, shown in the mobile drawer and as a `title`. */
  description: string
  icon: ComponentType<IconProps>
  group: AdminNavGroup
}

export const ADMIN_NAV: AdminNavItem[] = [
  {
    href: '/admin',
    label: 'Dashboard',
    description: 'Counts, money and everything that needs your attention.',
    icon: SparkleIcon,
    group: 'Overview',
  },
  {
    href: '/admin/registrations',
    label: 'Registrations',
    description: 'Approve, waitlist or reject entries — in bulk if you like.',
    icon: ShuttlecockIcon,
    group: 'People & money',
  },
  {
    href: '/admin/payments',
    label: 'Payments',
    description: 'Record entry fees and reconcile the till.',
    icon: GiftIcon,
    group: 'People & money',
  },
  {
    href: '/admin/teams',
    label: 'Teams',
    description: 'Pair free agents, name teams and set seeds.',
    icon: RacketIcon,
    group: 'People & money',
  },
  {
    href: '/admin/settings',
    label: 'Settings',
    description: 'Tournament dates, divisions and scoring rules.',
    icon: BaubleIcon,
    group: 'Overview',
  },
  {
    href: '/admin/draw',
    label: 'Draw',
    description: 'Generate the round robin and knockout bracket.',
    icon: TrophyIcon,
    group: 'Tournament day',
  },
  {
    href: '/admin/schedule',
    label: 'Schedule',
    description: 'Courts, time slots and the running order.',
    icon: SnowflakeIcon,
    group: 'Tournament day',
  },
  {
    href: '/admin/duty-roster',
    label: 'Duty Roster',
    description: 'Who is umpiring, scoring and calling lines.',
    icon: HollyIcon,
    group: 'Tournament day',
  },
  {
    href: '/tabulator',
    label: 'Tabulator',
    description: 'Verify scoresheets and resolve disputes.',
    icon: MedalIcon,
    group: 'Tournament day',
  },
  {
    href: '/admin/matches',
    label: 'Matches',
    description: 'Live scores, forfeits and walkovers.',
    icon: RacketIcon,
    group: 'Tournament day',
  },
  {
    href: '/admin/announcements',
    label: 'Announcements',
    description: 'Push news to the site and the courtside TV.',
    icon: SparkleIcon,
    group: 'Content',
  },
  {
    href: '/admin/gallery',
    label: 'Gallery',
    description: 'Approve, feature or bin photo uploads.',
    icon: BaubleIcon,
    group: 'Content',
  },
  {
    href: '/admin/awards',
    label: 'Awards',
    description: 'Champions, runners-up and sportsmanship gongs.',
    icon: TrophyIcon,
    group: 'Content',
  },
  {
    href: '/admin/checklist',
    label: 'Checklist',
    description: 'Loot bags, shirts, medals, trophies and prize money.',
    icon: GiftIcon,
    group: 'Content',
  },
]

/** `ADMIN_NAV` bucketed by group, in `ADMIN_NAV_GROUPS` order. */
export function adminNavByGroup(): { group: AdminNavGroup; items: AdminNavItem[] }[] {
  return ADMIN_NAV_GROUPS.map((group) => ({
    group,
    items: ADMIN_NAV.filter((item) => item.group === group),
  })).filter((section) => section.items.length > 0)
}

/**
 * True when `pathname` is inside `href`. `/admin` is matched exactly so the
 * Dashboard link doesn't stay lit on every sub-page.
 */
export function isAdminNavItemActive(item: AdminNavItem, pathname: string): boolean {
  if (item.href === '/admin') return pathname === '/admin' || pathname === '/admin/'
  return pathname === item.href || pathname.startsWith(`${item.href}/`)
}

/** The nav item matching `pathname`, preferring the longest (deepest) match. */
export function findAdminNavItem(pathname: string): AdminNavItem | undefined {
  return ADMIN_NAV.filter((item) => isAdminNavItemActive(item, pathname)).sort(
    (a, b) => b.href.length - a.href.length
  )[0]
}
