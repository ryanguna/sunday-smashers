import type { TvUpcomingMatch } from '@/lib/tv/types'
import { HollyIcon } from '@/components/icons'

const ROLE_LABEL: Record<string, string> = {
  umpire_scorer: 'Umpire / Scorer',
  scoresheet: 'Scoresheet',
  line_judge: 'Line Judge',
}

export function UpNextPanel({ upNext }: { upNext: TvUpcomingMatch | null }) {
  if (!upNext) {
    return (
      <PanelShell title="Up Next">
        <p className="text-frost/60">No further matches scheduled on this court yet.</p>
      </PanelShell>
    )
  }

  return (
    <PanelShell title="Up Next on This Court">
      <p className="mb-1 text-sm font-semibold uppercase tracking-wide text-[var(--color-brand-gold)]">
        {upNext.stageLabel}
      </p>
      <p className="mb-4 text-[clamp(1.1rem,1.6vw,1.6rem)] font-extrabold leading-tight">
        {upNext.teamA.name} <span className="text-frost/50">vs</span> {upNext.teamB.name}
      </p>

      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-frost/50">
        Duty Roster
      </p>
      <ul className="space-y-1.5">
        {upNext.duties.map((duty, i) => (
          <li
            key={`${duty.role}-${i}`}
            className="flex items-center justify-between rounded-[var(--radius-md)] bg-white/8 px-3 py-2 text-sm"
          >
            <span className="text-frost/70">{ROLE_LABEL[duty.role] ?? duty.role}</span>
            <span className="font-bold">{duty.playerName}</span>
          </li>
        ))}
      </ul>
      {upNext.duties.length === 0 && (
        <p className="text-sm text-frost/50">Duty roster to be confirmed.</p>
      )}
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
