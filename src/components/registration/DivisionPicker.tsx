'use client'

import { Badge } from '@/components/ui'
import { RacketIcon, ShuttlecockIcon, SparkleIcon } from '@/components/icons'
import { cn } from '@/lib/cn'
import { divisionCapacity, type DivisionSummary } from '@/lib/registration'

export interface DivisionPickerProps {
  divisions: DivisionSummary[]
  value: string
  onChange: (divisionId: string) => void
  error?: string
  disabled?: boolean
}

/**
 * Big, thumb-friendly radio cards for the two doubles divisions.
 *
 * Two things it deliberately no longer does. It does not show a "6 spots left
 * of 24" meter: the number is a count of *player slots derived from a team
 * cap*, which read to players as a countdown and put people off entering at
 * all — and a pre-registration the committee reviews by hand does not race.
 * It also does not disable a division based on the gender on the profile;
 * players pick their own draw and the committee confirms it.
 *
 * A division that is genuinely full still says so, because that changes what
 * submitting does (a waitlist entry rather than an entry).
 */
export function DivisionPicker({
  divisions,
  value,
  onChange,
  error,
  disabled = false,
}: DivisionPickerProps) {
  return (
    <fieldset className="mb-6" aria-describedby={error ? 'division-error' : undefined}>
      <legend className="mb-2 block text-sm font-semibold text-[var(--color-plum)]">
        Your division<span className="ml-0.5 text-[var(--color-brand-pink-dark)]">*</span>
      </legend>

      <div className="grid gap-3 sm:grid-cols-2">
        {divisions.map((division) => {
          const capacity = divisionCapacity(division)
          const selected = value === division.id
          const isDisabled = disabled

          return (
            <label
              key={division.id}
              className={cn(
                'group relative flex cursor-pointer flex-col gap-2 rounded-[var(--radius-lg)] border-2 bg-white p-4 shadow-[var(--shadow-soft)] transition',
                selected
                  ? 'border-[var(--color-brand-pink)] shadow-[var(--shadow-glow-pink)]'
                  : 'border-[var(--color-brand-lilac-light)]',
                isDisabled ? 'cursor-not-allowed opacity-60' : 'hover-lift'
              )}
            >
              <input
                type="radio"
                name="division"
                className="sr-only"
                value={division.id}
                checked={selected}
                disabled={isDisabled}
                onChange={() => onChange(division.id)}
              />

              <span className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className={cn(
                      'flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white',
                      selected
                        ? 'bg-[image:var(--gradient-candy)]'
                        : 'bg-[image:var(--gradient-mint-sky)]'
                    )}
                  >
                    {division.gender === 'womens' ? (
                      <ShuttlecockIcon size={19} />
                    ) : (
                      <RacketIcon size={19} />
                    )}
                  </span>
                  <span className="font-[family-name:var(--font-heading)] text-lg font-bold text-[var(--color-plum)]">
                    {division.name}
                  </span>
                </span>
                {selected && (
                  <SparkleIcon
                    size={20}
                    className="animate-twinkle text-[var(--color-brand-gold-dark)] [animation-duration:2.5s]"
                    aria-hidden="true"
                  />
                )}
              </span>

              {capacity.isFull && (
                <span className="flex flex-wrap items-center gap-2">
                  <Badge status="unpaid">Full — you’ll join the waitlist</Badge>
                </span>
              )}
            </label>
          )
        })}
      </div>

      {error && (
        <p id="division-error" role="alert" className="mt-2 text-xs font-semibold text-[var(--color-danger)]">
          {error}
        </p>
      )}
    </fieldset>
  )
}
