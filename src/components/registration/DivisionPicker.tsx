'use client'

import { Badge } from '@/components/ui'
import { RacketIcon, ShuttlecockIcon, SparkleIcon } from '@/components/icons'
import { cn } from '@/lib/cn'
import {
  divisionCapacity,
  divisionEligibilityHint,
  isDivisionEligible,
  type DivisionSummary,
  type ProfileGender,
} from '@/lib/registration'

export interface DivisionPickerProps {
  divisions: DivisionSummary[]
  value: string
  onChange: (divisionId: string) => void
  profileGender: ProfileGender
  error?: string
  disabled?: boolean
}

/**
 * Big, thumb-friendly radio cards for the two doubles divisions, each with a
 * live "spots left" meter. Ineligible divisions stay visible (so players can
 * see the whole tournament) but are disabled with a plain-English reason.
 *
 * The meter width is an integer percentage, so its inline style serialises
 * identically on the server and the client — no hydration mismatch.
 */
export function DivisionPicker({
  divisions,
  value,
  onChange,
  profileGender,
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
          const eligible = isDivisionEligible(division.gender, profileGender)
          const capacity = divisionCapacity(division)
          const selected = value === division.id
          const isDisabled = disabled || !eligible

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

              {capacity.playerCapacity !== null && (
                <span
                  aria-hidden="true"
                  className="h-2 w-full overflow-hidden rounded-full bg-[var(--color-brand-lilac-light)]"
                >
                  <span
                    className={cn(
                      'block h-full rounded-full',
                      capacity.isFull
                        ? 'bg-[var(--color-danger)]'
                        : 'bg-[image:var(--gradient-mint-sky)]'
                    )}
                    style={{ width: `${capacity.percentFull ?? 0}%` }}
                  />
                </span>
              )}

              <span className="flex flex-wrap items-center gap-2">
                <Badge status={capacity.isFull ? 'unpaid' : 'approved'}>{capacity.label}</Badge>
                {!eligible && (
                  <span className="text-xs font-semibold text-[var(--color-ink-muted)]">
                    {divisionEligibilityHint(division.gender)}
                  </span>
                )}
              </span>
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
