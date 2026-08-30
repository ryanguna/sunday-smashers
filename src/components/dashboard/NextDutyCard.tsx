import Link from 'next/link'
import { Badge } from '@/components/ui'
import { HollyIcon, ShuttlecockIcon } from '@/components/icons'
import { cn } from '@/lib/cn'
import { teamDisplayName } from '@/lib/public-data'
import {
  dutyRoleBlurb,
  dutyRoleLabel,
  stageLabel,
  type CountdownView,
  type PlayerDuty,
} from '@/lib/dashboard'
import { MatchCountdown } from './MatchCountdown'

export interface NextDutyCardProps {
  duty: PlayerDuty | null
  countdown: (CountdownView & { targetIso: string }) | null
  className?: string
}

/**
 * "Your next duty" — deliberately styled in a completely different colour
 * family (mint/sky, dashed border, whistle icon) from the pink "your next
 * match" hero, so a player glancing at their phone in a noisy gym can never
 * confuse a match they play with a match they officiate.
 */
export function NextDutyCard({ duty, countdown, className }: NextDutyCardProps) {
  const live = duty?.match.status === 'in_progress'

  return (
    <section
      aria-labelledby="next-duty-heading"
      className={cn(
        'relative overflow-hidden rounded-[var(--radius-xl)] border-[3px] border-dashed border-[var(--color-brand-mint-dark)] bg-[var(--color-brand-mint-light)] p-5 shadow-[var(--shadow-soft)] sm:p-6',
        className,
      )}
    >
      <HollyIcon
        size={140}
        className="pointer-events-none absolute -right-6 -bottom-8 text-[var(--color-brand-mint-dark)]/15"
        aria-hidden="true"
      />

      <div className="relative flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-2 rounded-[var(--radius-pill)] bg-[var(--color-brand-mint-dark)] px-3 py-1 text-xs font-extrabold tracking-wide text-white uppercase">
          <span aria-hidden="true">🔔</span> Your next duty — not your match
        </span>
        {live && <Badge status="live">Officiating now</Badge>}
        {countdown && !live && <MatchCountdown initialMsUntil={countdown.msUntil} size="sm" className="ml-auto" />}
      </div>

      {!duty ? (
        <div className="relative mt-4">
          <h2 id="next-duty-heading" className="text-lg font-extrabold" style={{ color: 'var(--color-plum)' }}>
            No duty on your sheet
          </h2>
          <p className="mt-1 flex items-start gap-2 text-sm text-[var(--color-ink-soft)]">
            <ShuttlecockIcon size={16} className="mt-0.5 shrink-0 text-[var(--color-brand-mint-dark)]" />
            The pair playing next officiates the current match, so a duty will appear here as soon as the
            roster is drawn. Enjoy the mince pies until then. 🥧
          </p>
        </div>
      ) : (
        <div className="relative mt-4">
          <p className="text-[0.65rem] font-extrabold tracking-[0.14em] text-[var(--color-brand-mint-dark)] uppercase">
            Your role
          </p>
          <h2
            id="next-duty-heading"
            className="font-[family-name:var(--font-heading)] text-2xl font-extrabold sm:text-3xl"
            style={{ color: 'var(--color-plum)' }}
          >
            {dutyRoleLabel(duty.role)}
          </h2>
          <p className="mt-1 text-sm font-semibold text-[var(--color-ink-soft)]">{dutyRoleBlurb(duty.role)}</p>

          <dl className="mt-3 grid grid-cols-2 gap-2.5">
            <div className="rounded-[var(--radius-lg)] bg-white/90 px-3 py-2">
              <dt className="text-[0.65rem] font-extrabold tracking-widest text-[var(--color-ink-muted)] uppercase">
                Court
              </dt>
              <dd className="font-[family-name:var(--font-heading)] text-lg font-extrabold text-[var(--color-plum)]">
                {duty.match.court ?? 'TBC'}
              </dd>
            </div>
            <div className="rounded-[var(--radius-lg)] bg-white/90 px-3 py-2">
              <dt className="text-[0.65rem] font-extrabold tracking-widest text-[var(--color-ink-muted)] uppercase">
                Time
              </dt>
              <dd className="font-[family-name:var(--font-heading)] text-lg font-extrabold text-[var(--color-plum)]">
                {duty.match.slotLabel ?? 'TBC'}
              </dd>
            </div>
          </dl>

          <p className="mt-3 rounded-[var(--radius-lg)] bg-white/90 px-3 py-2 text-sm text-[var(--color-ink-soft)]">
            <span className="font-bold text-[var(--color-plum)]">
              {teamDisplayName(duty.match.teamA, duty.match.sourceA)}
            </span>{' '}
            v{' '}
            <span className="font-bold text-[var(--color-plum)]">
              {teamDisplayName(duty.match.teamB, duty.match.sourceB)}
            </span>
            <span className="block text-xs font-semibold text-[var(--color-ink-muted)]">
              {stageLabel(duty.match.stage)} · first to {duty.match.pointsToWin}
              {duty.match.deuce ? '' : ', no deuce'}
            </span>
          </p>

          <Link
            href="/rules"
            className="mt-3 inline-block text-sm font-extrabold text-[var(--color-brand-mint-dark)] underline-offset-4 hover:underline"
          >
            Brush up on the officiating rules →
          </Link>
        </div>
      )}
    </section>
  )
}

/** Loud warning shown when a duty and a match land in the same time slot. */
export function DoubleBookingAlert({ className }: { className?: string }) {
  return (
    <p
      role="alert"
      className={cn(
        'flex items-start gap-2 rounded-[var(--radius-lg)] bg-[var(--color-danger)] px-4 py-3 text-sm font-bold text-white',
        className,
      )}
    >
      <span aria-hidden="true">🚨</span>
      <span>
        Heads up — your next duty clashes with one of your own matches. You can&rsquo;t be in two places at
        once: tell the tournament desk straight away so they can re-roster it.
      </span>
    </p>
  )
}
