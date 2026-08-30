import type { TvStandings } from '@/lib/tv/types'
import { PanelShell } from './UpNextPanel'

export function StandingsPanel({ standings }: { standings: TvStandings }) {
  const rows = standings.rows.slice(0, 8)
  const cols = 'grid-cols-[1.4rem_minmax(0,1fr)_1.7rem_1.7rem_2.7rem]'

  return (
    <PanelShell title={`Standings · ${standings.divisionLabel}`}>
      <div className="flex h-full flex-col">
        <div
          className={`grid ${cols} gap-2 border-b border-white/10 pb-2 text-[clamp(0.65rem,0.85vw,0.85rem)] uppercase tracking-wider text-frost/50`}
        >
          <span>#</span>
          <span>Pair</span>
          <span className="text-center">W</span>
          <span className="text-center">L</span>
          <span className="text-right">+/-</span>
        </div>
        <div className="flex flex-1 flex-col">
          {rows.map((row) => (
            <div
              key={row.teamId}
              className={`grid flex-1 ${cols} items-center gap-2 border-t border-white/10 text-[clamp(0.9rem,1.2vw,1.3rem)]`}
            >
              <span className="font-bold text-[var(--color-brand-gold)]">{row.rank}</span>
              <span className="flex min-w-0 flex-col justify-center gap-0.5 pr-2">
                <span className="truncate font-semibold">{standings.teamNames[row.teamId] ?? row.teamId}</span>
                {row.forfeits > 0 && (
                  <span className="w-fit rounded-[var(--radius-pill)] bg-[var(--color-danger)]/25 px-1.5 py-0.5 text-[0.55em] font-bold uppercase text-[var(--color-brand-pink-light)]">
                    Forfeit
                  </span>
                )}
              </span>
              <span className="text-center tabular-nums">{row.wins}</span>
              <span className="text-center tabular-nums">{row.losses}</span>
              <span className="text-right tabular-nums">
                {row.pointDiff > 0 ? `+${row.pointDiff}` : row.pointDiff}
              </span>
            </div>
          ))}
        </div>
        <p className="pt-3 text-[clamp(0.7rem,0.9vw,0.9rem)] text-frost/40">
          Top 4 qualify for the semi-finals.
        </p>
      </div>
    </PanelShell>
  )
}
