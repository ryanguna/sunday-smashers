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
      <div className="flex h-full flex-col gap-[clamp(0.6rem,1.4vh,1rem)]">
        {[...semis, ...knockout].map((fixture) => (
          <div
            key={fixture.key}
            className="flex flex-1 flex-col justify-center rounded-[var(--radius-md)] bg-white/8 px-4 py-3"
          >
            <p className="mb-1 text-[clamp(0.75rem,1vw,1.05rem)] font-semibold uppercase tracking-wider text-[var(--color-brand-gold)]">
              {fixture.label}
            </p>
            <p className="text-[clamp(1.1rem,1.7vw,1.9rem)] font-bold leading-snug">
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
