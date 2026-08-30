import { PanelShell } from './UpNextPanel'
import { SparkleIcon, BaubleIcon, TrophyIcon } from '@/components/icons'

/** Festive filler slide for the panel rotation — sponsor space today. */
export function SponsorPanel() {
  return (
    <PanelShell title="Sunday Smashers">
      <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
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
    </PanelShell>
  )
}
