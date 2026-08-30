import { PanelShell } from './UpNextPanel'
import { RacketIcon, ShuttlecockIcon, SnowflakeIcon } from '@/components/icons'

const RULES: { icon: typeof RacketIcon; text: string }[] = [
  {
    icon: ShuttlecockIcon,
    text: 'Round robin elimination games are first to 15 points, no deuce.',
  },
  {
    icon: RacketIcon,
    text: 'Semi-finals and the Championship / Battle for 3rd are first to 21, no deuce.',
  },
  {
    icon: SnowflakeIcon,
    text: 'Late or no-show players forfeit the match — please be courtside 5 minutes early.',
  },
  {
    icon: ShuttlecockIcon,
    text: "The next match's players officiate this one as umpire, scoresheet and line judges.",
  },
  {
    icon: RacketIcon,
    text: 'Umpire and line judge calls are final.',
  },
]

/** Rotating rules-reminder slide for the side panel. */
export function RulesPanel() {
  return (
    <PanelShell title="Rules Reminder">
      <ul className="flex h-full flex-col justify-center gap-[clamp(0.85rem,1.8vh,1.6rem)]">
        {RULES.map((rule, i) => {
          const Icon = rule.icon
          return (
            <li key={i} className="flex items-start gap-3">
              <Icon className="mt-0.5 h-[1.4em] w-[1.4em] shrink-0 text-[var(--color-brand-mint)]" />
              <span className="text-[clamp(1rem,1.35vw,1.35rem)] font-semibold leading-snug text-frost/90">
                {rule.text}
              </span>
            </li>
          )
        })}
      </ul>
    </PanelShell>
  )
}
