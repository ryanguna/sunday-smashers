import { Card } from '@/components/ui'
import { GiftIcon, ShuttlecockIcon, SnowflakeIcon } from '@/components/icons'
import type { DrawPreview } from '@/lib/draw-admin'
import type { DrawTeamEntry } from '@/lib/draw-admin'

/**
 * The generated-but-not-yet-published fixture list, grouped by round.
 * Rounds are internally disjoint (circle method) so every fixture in a
 * round can run at the same time across courts.
 */
export function FixturePreview({
  preview,
  teams,
}: {
  preview: DrawPreview
  teams: Map<string, DrawTeamEntry>
}) {
  const nameOf = (id: string) => teams.get(id)?.name ?? id

  return (
    <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
      {preview.rounds.map((round) => (
        <Card key={round.round} variant="frosted" className="p-3.5">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="flex items-center gap-1.5 font-[family-name:var(--font-heading)] text-sm font-extrabold text-[var(--color-plum)]">
              <SnowflakeIcon
                size={15}
                className="text-[var(--color-brand-sky-dark)]"
                aria-hidden="true"
              />
              Round {round.round}
            </h3>
            <span className="rounded-[var(--radius-pill)] bg-[var(--color-brand-mint-light)] px-2 py-0.5 text-[0.65rem] font-bold text-[var(--color-brand-mint-dark)]">
              {round.fixtures.length} concurrent
            </span>
          </div>

          <ul className="flex flex-col gap-1">
            {round.fixtures.map((fixture) => (
              <li
                key={`${fixture.teamA}-${fixture.teamB}`}
                className="rounded-[var(--radius-sm)] bg-white/80 px-2.5 py-2 text-xs"
              >
                <p className="flex items-start gap-1.5 font-semibold text-[var(--color-plum)]">
                  <ShuttlecockIcon
                    size={13}
                    className="mt-0.5 shrink-0 text-[var(--color-brand-pink-dark)]"
                    aria-hidden="true"
                  />
                  <span className="min-w-0 break-words">{nameOf(fixture.teamA)}</span>
                </p>
                <p
                  className="my-1 flex items-center gap-2 pl-[1.15rem] text-[var(--color-brand-lilac-dark)]"
                  aria-hidden="true"
                >
                  <span className="font-[family-name:var(--font-script)] text-sm">v</span>
                  <span className="h-px flex-1 bg-[var(--color-brand-lilac)] opacity-60" />
                </p>
                <p className="pl-[1.15rem] font-semibold break-words text-[var(--color-plum)]">
                  {nameOf(fixture.teamB)}
                </p>
              </li>
            ))}
          </ul>

          {round.byeTeamId && (
            <p className="mt-2 flex items-center gap-1.5 rounded-[var(--radius-sm)] bg-[var(--color-brand-gold-light)] px-2 py-1.5 text-[0.7rem] font-semibold text-[var(--color-brand-gold-dark)]">
              <GiftIcon size={13} aria-hidden="true" />
              {nameOf(round.byeTeamId)} rests this round
            </p>
          )}
        </Card>
      ))}
    </div>
  )
}
