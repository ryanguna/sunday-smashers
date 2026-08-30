import type { TvUpcomingMatch, CourtSnapshot } from '@/lib/tv/types'
import { HollyIcon } from '@/components/icons'

const ROLE_LABEL: Record<string, string> = {
  umpire_scorer: 'Umpire / Scorer',
  scoresheet: 'Scoresheet',
  line_judge: 'Line Judge',
}

export function UpNextPanel({
  upNext,
  laterOnCourt = [],
}: {
  upNext: TvUpcomingMatch | null
  laterOnCourt?: CourtSnapshot['laterOnCourt']
}) {
  if (!upNext) {
    return (
      <PanelShell title="Up Next">
        <p className="text-[clamp(0.95rem,1.3vw,1.3rem)] text-frost/60">
          No further matches scheduled on this court yet.
        </p>
      </PanelShell>
    )
  }

  return (
    <PanelShell title="Up Next on This Court">
      <div className="flex h-full flex-col gap-[clamp(1rem,2.4vh,1.75rem)]">
        <div className="shrink-0">
          <p className="mb-1.5 text-[clamp(0.8rem,1.05vw,1.05rem)] font-semibold uppercase tracking-wide text-[var(--color-brand-gold)]">
            {upNext.stageLabel}
          </p>
          <p className="text-[clamp(1.3rem,1.9vw,1.9rem)] font-extrabold leading-tight">
            {upNext.teamA.name} <span className="text-frost/50">vs</span> {upNext.teamB.name}
          </p>
        </div>

        <div className="flex flex-1 flex-col">
          <p className="mb-2 shrink-0 text-[clamp(0.7rem,0.95vw,0.95rem)] font-semibold uppercase tracking-wider text-frost/50">
            Duty Roster
          </p>
          {upNext.duties.length === 0 ? (
            <p className="text-[clamp(0.9rem,1.1vw,1.1rem)] text-frost/50">Duty roster to be confirmed.</p>
          ) : (
            <div className="flex flex-1 flex-col gap-2">
              {upNext.duties.map((duty, i) => (
                <div
                  key={`${duty.role}-${i}`}
                  className="flex flex-1 items-center justify-between rounded-[var(--radius-md)] bg-white/8 px-3.5 text-[clamp(0.95rem,1.3vw,1.4rem)]"
                >
                  <span className="text-frost/70">{ROLE_LABEL[duty.role] ?? duty.role}</span>
                  <span className="font-bold">{duty.playerName}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {laterOnCourt.length > 0 && (
          <div className="flex flex-1 flex-col border-t border-white/10 pt-[clamp(0.75rem,1.6vh,1.5rem)]">
            <p className="mb-2 shrink-0 text-[clamp(0.7rem,0.95vw,0.95rem)] font-semibold uppercase tracking-wider text-frost/50">
              Later on This Court
            </p>
            <div className="flex flex-1 flex-col gap-2">
              {laterOnCourt.map((m) => (
                <div
                  key={m.matchId}
                  className="flex flex-1 flex-col justify-center rounded-[var(--radius-md)] bg-white/5 px-3.5 py-1"
                >
                  <span className="mb-0.5 block text-[clamp(0.7rem,0.9vw,0.9rem)] font-semibold uppercase tracking-wide text-frost/40">
                    {m.scheduledLabel}
                  </span>
                  <span className="block text-[clamp(0.9rem,1.2vw,1.3rem)] font-bold leading-snug">
                    {m.teamA.name} <span className="font-normal text-frost/50">vs</span> {m.teamB.name}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </PanelShell>
  )
}

export function PanelShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="animate-fade-in flex h-full flex-col">
      <div className="mb-3 flex items-center gap-2 text-frost/80">
        <HollyIcon className="h-5 w-5 text-[var(--color-brand-mint)]" />
        <h2
          className="font-[family-name:var(--font-heading)] text-[clamp(1rem,1.3vw,1.35rem)] font-bold uppercase tracking-wide"
          style={{ color: 'rgba(251, 251, 255, 0.8)' }}
        >
          {title}
        </h2>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
    </div>
  )
}
