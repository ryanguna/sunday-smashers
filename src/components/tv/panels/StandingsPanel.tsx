import type { TvStandings } from '@/lib/tv/types'
import { PanelShell } from './UpNextPanel'

export function StandingsPanel({ standings }: { standings: TvStandings }) {
  return (
    <PanelShell title={`Standings · ${standings.divisionLabel}`}>
      <div className="flex h-full flex-col justify-center">
        <table className="w-full border-collapse text-[clamp(0.9rem,1.15vw,1.15rem)]">
          <thead>
            <tr className="text-left text-[clamp(0.65rem,0.85vw,0.85rem)] uppercase tracking-wider text-frost/50">
              <th className="pb-2 pr-1">#</th>
              <th className="pb-2">Pair</th>
              <th className="pb-2 text-center">W</th>
              <th className="pb-2 text-center">L</th>
              <th className="pb-2 text-right">+/-</th>
            </tr>
          </thead>
          <tbody>
            {standings.rows.slice(0, 8).map((row) => (
              <tr key={row.teamId} className="border-t border-white/10">
                <td className="py-2.5 pr-1 font-bold text-[var(--color-brand-gold)]">{row.rank}</td>
                <td className="py-2.5 pr-2 font-semibold">
                  {standings.teamNames[row.teamId] ?? row.teamId}
                  {row.forfeits > 0 && (
                    <span className="ml-1.5 rounded-[var(--radius-pill)] bg-[var(--color-danger)]/25 px-1.5 py-0.5 text-[0.6rem] font-bold uppercase text-[var(--color-brand-pink-light)]">
                      Forfeit
                    </span>
                  )}
                </td>
                <td className="py-2.5 text-center tabular-nums">{row.wins}</td>
                <td className="py-2.5 text-center tabular-nums">{row.losses}</td>
                <td className="py-2.5 text-right tabular-nums">
                  {row.pointDiff > 0 ? `+${row.pointDiff}` : row.pointDiff}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-4 text-[clamp(0.7rem,0.9vw,0.9rem)] text-frost/40">
          Top 4 qualify for the semi-finals.
        </p>
      </div>
    </PanelShell>
  )
}
