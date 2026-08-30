import type { TvBracket } from '@/lib/tv/types'
import { PanelShell } from './UpNextPanel'

function label(bracket: TvBracket, id: string | null, source: string): string {
  if (!id) return source
  return bracket.teamNames[id] ?? id
}

export function BracketPanel({ bracket }: { bracket: TvBracket }) {
  const semis = bracket.fixtures.filter((f) => f.stage === 'semi')
  const knockout = bracket.fixtures.filter((f) => f.stage !== 'semi')

  return (
    <PanelShell title={`Bracket · ${bracket.divisionLabel}`}>
      <div className="grid grid-cols-1 gap-2 text-sm">
        {[...semis, ...knockout].map((fixture) => (
          <div
            key={fixture.key}
            className="rounded-[var(--radius-md)] bg-white/8 px-3 py-2"
          >
            <p className="mb-1 text-[0.65rem] font-semibold uppercase tracking-wider text-[var(--color-brand-gold)]">
              {fixture.label}
            </p>
            <p className="font-bold leading-snug">
              {label(bracket, fixture.teamA, fixture.sourceA)}{' '}
              <span className="font-normal text-frost/50">vs</span>{' '}
              {label(bracket, fixture.teamB, fixture.sourceB)}
            </p>
          </div>
        ))}
      </div>
    </PanelShell>
  )
}
