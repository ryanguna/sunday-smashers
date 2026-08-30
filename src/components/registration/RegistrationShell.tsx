import type { ReactNode } from 'react'
import { Snowfall } from '@/components/ui'
import { BaubleIcon, HollyIcon, ShuttlecockIcon, SnowflakeIcon } from '@/components/icons'
import { cn } from '@/lib/cn'
import { TOURNAMENT_DATE_LABEL } from '@/lib/tournament'

export interface RegistrationShellProps {
  eyebrow?: string
  title: ReactNode
  description?: ReactNode
  children: ReactNode
  /** Extra content pinned directly under the heading (e.g. a countdown). */
  aside?: ReactNode
  className?: string
}

/**
 * Shared festive chrome for every `/register/*` screen: pastel snowfall,
 * drifting badminton/Christmas motifs and a candy-gradient headline.
 *
 * All decoration is class-driven (no computed inline styles) so the server
 * and client markup match byte-for-byte, and every animation is switched
 * off by the `prefers-reduced-motion` block in `globals.css`.
 */
export function RegistrationShell({
  eyebrow,
  title,
  description,
  children,
  aside,
  className,
}: RegistrationShellProps) {
  return (
    <main className="relative overflow-hidden px-4 pt-10 pb-20 sm:pt-14">
      <Snowfall />

      {/* Drifting motifs — decorative only. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <ShuttlecockIcon
          size={92}
          className="animate-bob absolute -top-2 -left-6 text-[var(--color-brand-pink-light)] opacity-70 [animation-duration:7s] sm:left-6"
        />
        <HollyIcon
          size={78}
          className="animate-drift absolute top-24 -right-4 text-[var(--color-brand-mint-light)] opacity-80 [animation-duration:9s] sm:right-10"
        />
        <BaubleIcon
          size={64}
          className="animate-bob absolute bottom-24 left-2 text-[var(--color-brand-lilac-light)] opacity-70 [animation-duration:8s] sm:left-16"
        />
        <SnowflakeIcon
          size={56}
          className="animate-twinkle absolute right-6 bottom-40 text-[var(--color-brand-sky-light)] [animation-duration:5s]"
        />
      </div>

      <div className={cn('relative z-10 mx-auto w-full max-w-3xl', className)}>
        <header className="mb-8 text-center">
          <p className="font-[family-name:var(--font-script)] text-2xl text-[var(--color-brand-pink-dark)] sm:text-3xl">
            {eyebrow ?? 'Sunday Smashers'}
          </p>
          <h1 className="mt-1 bg-[image:var(--gradient-candy)] bg-clip-text text-4xl font-extrabold text-transparent sm:text-5xl">
            {title}
          </h1>
          <p className="mt-3 inline-flex flex-wrap items-center justify-center gap-2 rounded-[var(--radius-pill)] bg-white/80 px-4 py-1.5 text-sm font-semibold text-[var(--color-plum)] shadow-[var(--shadow-soft)]">
            <SnowflakeIcon size={16} className="text-[var(--color-brand-sky-dark)]" aria-hidden="true" />
            <span>{TOURNAMENT_DATE_LABEL}</span>
            <span>
              <span className="text-[var(--color-brand-lilac-dark)]" aria-hidden="true">
                ·{' '}
              </span>
              Men&rsquo;s &amp; Women&rsquo;s Doubles
            </span>
          </p>
          {description && (
            <p className="mx-auto mt-4 max-w-xl text-[var(--color-ink-soft)]">{description}</p>
          )}
          {aside && <div className="mt-6">{aside}</div>}
        </header>

        {children}
      </div>
    </main>
  )
}
