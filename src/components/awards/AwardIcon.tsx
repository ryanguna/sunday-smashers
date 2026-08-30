import type { ReactNode } from 'react'
import {
  BaubleIcon,
  GiftIcon,
  HollyIcon,
  MedalIcon,
  RacketIcon,
  SparkleIcon,
  TrophyIcon,
} from '@/components/icons'
import type { AwardIconKey } from '@/lib/awards'

/** Resolves a catalogue icon key to one of the shared festive icons. */
export function AwardIcon({ icon, size = 22 }: { icon: AwardIconKey; size?: number }): ReactNode {
  switch (icon) {
    case 'trophy':
      return <TrophyIcon size={size} />
    case 'medal':
      return <MedalIcon size={size} />
    case 'gift':
      return <GiftIcon size={size} />
    case 'holly':
      return <HollyIcon size={size} />
    case 'bauble':
      return <BaubleIcon size={size} />
    case 'racket':
      return <RacketIcon size={size} />
    case 'sparkle':
    default:
      return <SparkleIcon size={size} />
  }
}
