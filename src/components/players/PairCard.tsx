import Link from 'next/link'
import { Badge, Card, CardBody } from '@/components/ui'
import { cn } from '@/lib/cn'
import type { PublicPlayerDirectoryEntry } from '@/lib/public-data'

export interface PairCardProps {
  entry: PublicPlayerDirectoryEntry
  /** Profile handle for each player id in this pair. */
  handleByPlayerId: ReadonlyMap<string, string>
  className?: string
}

/**
 * One pair in the `/players` directory. Each player name is a link straight
 * to their public profile — the whole point of the directory.
 */
export function PairCard({ entry, handleByPlayerId, className }: PairCardProps) {
  const { team } = entry

  return (
    <Card variant="frosted" className={cn('h-full', className)}>
      <CardBody className="flex h-full flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-extrabold text-[var(--color-plum)]">{team.name}</p>
          {team.seed != null && <Badge status="info">Seed #{team.seed}</Badge>}
        </div>

        <ul className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm">
          {team.players.map((player, i) => {
            const handle = handleByPlayerId.get(player.id)
            return (
              <li key={player.id} className="flex items-center gap-1.5">
                {i > 0 && (
                  <span aria-hidden="true" className="text-[var(--color-ink-muted)]">
                    &amp;
                  </span>
                )}
                {handle ? (
                  <Link
                    href={`/players/${handle}`}
                    className="rounded-[var(--radius-sm)] font-bold text-[var(--color-brand-lilac-dark)] underline decoration-2 underline-offset-4 hover:text-[var(--color-brand-pink-dark)]"
                  >
                    {player.name}
                  </Link>
                ) : (
                  <span className="text-[var(--color-ink-soft)]">{player.name}</span>
                )}
              </li>
            )
          })}
        </ul>

        <div className="mt-auto flex flex-wrap items-center gap-3 border-t border-black/5 pt-2 text-xs text-[var(--color-ink-muted)]">
          {entry.rank != null && <span>Rank #{entry.rank}</span>}
          <span>{entry.played} played</span>
          <span className="text-[var(--color-success)]">{entry.wins}W</span>
          <span className="text-[var(--color-danger)]">{entry.losses}L</span>
        </div>
      </CardBody>
    </Card>
  )
}
