import type { ComponentType } from 'react'
import type { IconProps } from '@/components/icons/types'
import {
  BaubleIcon,
  GiftIcon,
  MedalIcon,
  RacketIcon,
  ShuttlecockIcon,
  SnowflakeIcon,
} from '@/components/icons'

/**
 * The settings sub-routes, in tab order. Shared by the tab strip and the
 * `/admin/settings` landing page so they can never drift apart.
 */

export interface SettingsSection {
  href: string
  label: string
  description: string
  icon: ComponentType<IconProps>
}

export const SETTINGS_SECTIONS: SettingsSection[] = [
  {
    href: '/admin/settings',
    label: 'Tournament',
    description: 'Name, date, venue, registration window and who to contact.',
    icon: BaubleIcon,
  },
  {
    href: '/admin/settings/divisions',
    label: 'Divisions',
    description: 'Entry caps, entry fees and which divisions are open.',
    icon: ShuttlecockIcon,
  },
  {
    href: '/admin/settings/rules',
    label: 'Rules',
    description: 'Points to win, deuce, caps and how many pairs qualify.',
    icon: RacketIcon,
  },
  {
    href: '/admin/settings/courts',
    label: 'Courts & slots',
    description: 'Courts available and the time slots matches run in.',
    icon: SnowflakeIcon,
  },
  {
    href: '/admin/settings/roles',
    label: 'Roles',
    description: 'Who is an admin, tabulator, duty official or player.',
    icon: MedalIcon,
  },
  {
    href: '/admin/settings/prizes',
    label: 'Prizes & loot',
    description: 'Cash prizes, trophies, medals and loot bag contents.',
    icon: GiftIcon,
  },
]
