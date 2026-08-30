import { cn } from '@/lib/cn'
import type { FunStat } from '@/lib/player-profile'

export interface ProfileStatsProps {
  stats: readonly FunStat[]
  className?: string
}

/** Alternating pastel washes so the grid reads like a row of baubles. */
const TILE_TINTS = [
  'from-[var(--color-brand-pink-light)] to-white',
  'from-[var(--color-brand-lilac-light)] to-white',
  'from-[var(--color-brand-mint-light)] to-white',
  'from-[var(--color-brand-sky-light)] to-white',
  'from-[var(--color-brand-gold-light)] to-white',
  'from-[var(--color-brand-pink-light)] to-white',
]

/** The festive "brag" tiles — six derived stats, always all six. */
export function ProfileStats({ stats, className }: ProfileStatsProps) {
  return (
    <section aria-labelledby="fun-stats-heading" className={cn(className)}>
      <h2
        id="fun-stats-heading"
        className="mb-3 flex items-center gap-2 text-lg font-extrabold"
        style={{ color: 'var(--color-plum)' }}
      >
        <span aria-hidden="true">✨</span>
        Christmas stat stocking
      </h2>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {stats.map((stat, i) => (
          <li key={stat.key}>
            <article
              className={cn(
                'hover-lift flex h-full flex-col gap-1 rounded-[var(--radius-lg)] border border-white/70 bg-gradient-to-br p-4 shadow-[var(--shadow-soft)]',
                TILE_TINTS[i % TILE_TINTS.length],
              )}
            >
              <h3 className="flex items-center gap-2 text-xs font-extrabold tracking-widest text-[var(--color-ink-muted)] uppercase">
                <span aria-hidden="true" className="text-base">
                  {stat.emoji}
                </span>
                {stat.label}
              </h3>
              <p
                className="font-[family-name:var(--font-heading)] text-4xl font-extrabold tabular-nums"
                style={{ color: 'var(--color-plum)' }}
              >
                {stat.value}
              </p>
              <p className="text-sm font-semibold text-[var(--color-ink-soft)]">{stat.detail}</p>
            </article>
          </li>
        ))}
      </ul>
    </section>
  )
}
