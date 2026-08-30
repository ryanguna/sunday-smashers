'use client'

import { cn } from '@/lib/cn'
import { ShuttlecockIcon } from '@/components/icons'
import type { ScoringSide } from '@/lib/scoring'

export interface PointButtonProps {
  side: ScoringSide
  teamName: string
  players: readonly string[]
  score: number
  serving: boolean
  serverName: string
  serviceCourt: 'right' | 'left'
  gamePoint: boolean
  disabled: boolean
  onPoint: () => void
}

/**
 * The only control that matters. Half the screen, one job.
 *
 * Sized so it can be hit without looking: a minimum of 15rem tall on a phone,
 * full bleed to the edges of the card, with the score itself as the visual
 * anchor. The festive gradient lives in a low-opacity wash *behind* the text
 * so nothing decorative ever competes with the number or shrinks the target.
 */
export function PointButton({
  side,
  teamName,
  players,
  score,
  serving,
  serverName,
  serviceCourt,
  gamePoint,
  disabled,
  onPoint,
}: PointButtonProps) {
  const tint =
    side === 'a'
      ? {
          ring: 'var(--color-brand-pink-dark)',
          wash: 'var(--color-brand-pink-light)',
          text: 'var(--color-brand-pink-dark)',
        }
      : {
          ring: 'var(--color-brand-sky-dark)',
          wash: 'var(--color-brand-sky-light)',
          text: 'var(--color-brand-sky-dark)',
        }

  return (
    <button
      type="button"
      onClick={onPoint}
      disabled={disabled}
      aria-label={`Award the rally to ${teamName}. They have ${score} point${score === 1 ? '' : 's'}.`}
      className={cn(
        'group relative flex min-h-[15rem] w-full flex-col items-center justify-center gap-2 overflow-hidden rounded-[var(--radius-xl)] border-4 bg-white px-4 py-6 text-center',
        'transition-transform duration-150 ease-[var(--ease-bounce)] active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100',
        'focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-[var(--color-plum)]',
        'disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100',
        'sm:min-h-[18rem]',
      )}
      style={{
        borderColor: serving ? tint.ring : 'var(--color-brand-lilac-light)',
      }}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{ background: tint.wash, opacity: gamePoint ? '0.55' : '0.25' }}
      />

      <span className="relative flex min-h-[1.75rem] items-center gap-2">
        {serving ? (
          <span
            className="inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] bg-white px-3 py-1 text-sm font-bold uppercase tracking-wide shadow-[var(--shadow-soft)]"
            style={{ color: tint.text }}
          >
            <ShuttlecockIcon className="h-4 w-4" aria-hidden="true" />
            Serving · {serviceCourt}
          </span>
        ) : null}
        {gamePoint ? (
          <span className="inline-flex items-center rounded-[var(--radius-pill)] bg-[var(--color-brand-gold)] px-3 py-1 text-sm font-bold uppercase tracking-wide text-[var(--color-plum)]">
            Game point
          </span>
        ) : null}
      </span>

      <span
        className="relative block font-[family-name:var(--font-heading)] text-2xl font-extrabold leading-tight"
        style={{ color: 'var(--color-plum)' }}
      >
        {teamName}
      </span>

      <span
        className="relative block font-[family-name:var(--font-heading)] font-black leading-none tabular-nums"
        style={{ fontSize: '5.5rem', color: 'var(--color-plum)' }}
      >
        {score}
      </span>

      <span className="relative block text-base font-semibold text-[var(--color-ink-soft)]">
        {players.join(' & ')}
      </span>

      <span className="relative block text-sm font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]">
        {serving && serverName ? `${serverName} to serve` : 'Tap to award the rally'}
      </span>
    </button>
  )
}
