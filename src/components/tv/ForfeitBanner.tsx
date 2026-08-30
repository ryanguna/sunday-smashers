import type { TvTeam } from '@/lib/tv/types'

export function ForfeitBanner({ forfeitedTeam }: { forfeitedTeam: TvTeam }) {
  return (
    <div className="animate-pop-in flex items-center justify-center gap-3 rounded-[var(--radius-lg)] bg-[var(--color-danger)]/90 px-6 py-3 text-center shadow-[var(--shadow-lift)]">
      <span className="text-[clamp(1.1rem,1.8vw,1.6rem)] font-extrabold uppercase tracking-wide text-white">
        Forfeit — {forfeitedTeam.name} did not take the court
      </span>
    </div>
  )
}
