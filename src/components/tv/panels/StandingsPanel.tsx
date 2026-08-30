import type { TvStandings } from '@/lib/tv/types'
import { PanelShell } from './UpNextPanel'

export function StandingsPanel({ standings }: { standings: TvStandings }) {
  return (
    <PanelShell title={`Standings · ${standings.divisionLabel}`}>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="text-left text-[0.65rem] uppercase tracking-wider text-frost/50">
            <th className="pb-1.5 pr-1">#</th>
            <th className="pb-1.5">Pair</th>
            <th className="pb-1.5 text-center">W</th>
            <th className="pb-1.5 text-center">L</th>
            <th className="pb-1.5 text-right">+/-</th>
          </tr>
        </thead>
        <tbody>
          {standings.rows.slice(0, 6).map((row) => (
            <tr key={row.teamId} className="border-t border-white/10">
              <td className="py-1.5 pr-1 font-bold text-[var(--color-brand-gold)]">{row.rank}</td>
              <td className="py-1.5 pr-2 font-semibold">
                {standings.teamNames[row.teamId] ?? row.teamId}
                {row.forfeits > 0 && (
                  <span className="ml-1.5 rounded-[var(--radius-pill)] bg-[var(--color-danger)]/25 px-1.5 py-0.5 text-[0.6rem] font-bold uppercase text-[var(--color-brand-pink-light)]">
                    Forfeit
                  </span>
                )}
              </td>
              <td className="py-1.5 text-center tabular-nums">{row.wins}</td>
              <td className="py-1.5 text-center tabular-nums">{row.losses}</td>
              <td className="py-1.5 text-right tabular-nums">
                {row.pointDiff > 0 ? `+${row.pointDiff}` : row.pointDiff}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </PanelShell>
  )
}
