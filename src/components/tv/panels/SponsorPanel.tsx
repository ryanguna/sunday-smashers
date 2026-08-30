import { PanelShell } from './UpNextPanel'
import { SparkleIcon, BaubleIcon, TrophyIcon, ShuttlecockIcon, RacketIcon, GiftIcon } from '@/components/icons'

const FORMAT_STEPS: { icon: typeof RacketIcon; title: string; text: string }[] = [
  { icon: ShuttlecockIcon, title: 'Round Robin', text: 'Every pair plays every other pair in their division.' },
  { icon: RacketIcon, title: 'Top 4 Knockout', text: 'The top 4 pairs advance to the semi-finals.' },
  { icon: TrophyIcon, title: 'Finals Day', text: 'Winners meet in the Championship, runners-up play Battle for 3rd.' },
]

/** Festive filler slide for the panel rotation — sponsor space today. */
export function SponsorPanel() {
  return (
    <PanelShell title="Sunday Smashers">
      <div className="flex h-full flex-col gap-[clamp(1rem,2.6vh,2rem)]">
        <div className="flex shrink-0 flex-col items-center gap-3 text-center">
          <div className="flex gap-2 text-[var(--color-brand-gold)]">
            <BaubleIcon className="animate-bob h-8 w-8" />
            <TrophyIcon className="h-9 w-9" />
            <BaubleIcon className="animate-bob h-8 w-8" style={{ animationDelay: '0.4s' }} />
          </div>
          <p className="font-[family-name:var(--font-script)] text-[clamp(1.4rem,2.4vw,2.2rem)] text-[var(--color-brand-pink-light)]">
            Smash. Compete. Celebrate.
          </p>
          <p className="flex items-center gap-1.5 text-sm text-frost/60">
            <SparkleIcon className="h-4 w-4" /> Christmas Mini Tournament · 13 Dec 2026
          </p>
        </div>

        <div className="flex flex-1 flex-col gap-2 border-t border-white/10 pt-[clamp(0.75rem,1.6vh,1.5rem)]">
          {FORMAT_STEPS.map((step, i) => {
            const Icon = step.icon
            return (
              <div
                key={i}
                className="flex flex-1 items-center gap-3 rounded-[var(--radius-md)] bg-white/8 px-4"
              >
                <Icon className="h-[1.8em] w-[1.8em] shrink-0 text-[var(--color-brand-mint)]" />
                <div>
                  <p className="text-[clamp(0.95rem,1.25vw,1.3rem)] font-bold">{step.title}</p>
                  <p className="text-[clamp(0.8rem,1vw,1.05rem)] leading-snug text-frost/70">{step.text}</p>
                </div>
              </div>
            )
          })}
        </div>

        <p className="flex shrink-0 items-center justify-center gap-1.5 text-[clamp(0.75rem,0.95vw,0.95rem)] text-frost/50">
          <GiftIcon className="h-4 w-4" /> Thanks for playing — see you courtside!
        </p>
      </div>
    </PanelShell>
  )
}
