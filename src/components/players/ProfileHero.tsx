import Link from 'next/link'
import { Card, CardBody } from '@/components/ui'
import { MedalIcon, ShuttlecockIcon, SparkleIcon, TrophyIcon } from '@/components/icons'
import { cn } from '@/lib/cn'
import type { PlayerProfile } from '@/lib/player-profile'
import type { Podium } from '@/lib/dashboard'

export interface ProfileHeroProps {
  profile: PlayerProfile
  className?: string
}

const PODIUM_RIBBON: Record<Exclude<Podium, null>, { label: string; emoji: string }> = {
  champion: { label: 'Christmas Champion', emoji: '🏆' },
  runner_up: { label: 'Runner-Up', emoji: '🥈' },
  third: { label: 'Third Place', emoji: '🥉' },
  fourth: { label: 'Semi-Finalist', emoji: '🎄' },
}

function Chip({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] bg-white/85 px-3 py-1 text-sm font-extrabold text-[var(--color-plum)] shadow-[var(--shadow-soft)]',
        className,
      )}
    >
      {children}
    </span>
  )
}

/**
 * The bauble avatar, name, pair, partner link and podium ribbon — the part
 * of the page that ends up in the group chat screenshot.
 */
export function ProfileHero({ profile, className }: ProfileHeroProps) {
  const ribbon = profile.podium ? PODIUM_RIBBON[profile.podium] : null

  return (
    <Card
      variant="frosted"
      className={cn('relative overflow-hidden border-2 border-white/70 p-0', className)}
    >
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-32 bg-[image:var(--gradient-candy)] opacity-25"
      />
      <CardBody className="relative flex flex-col gap-5 p-5 sm:p-7">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-6">
          {/* Bauble avatar: cap + hanging loop drawn above the ball. */}
          <div className="flex shrink-0 flex-col items-center self-center sm:self-start">
            <span
              aria-hidden="true"
              className="h-3 w-3 rounded-t-full border-2 border-b-0 border-[var(--color-brand-gold-dark)]"
            />
            <span
              aria-hidden="true"
              className="-mt-0.5 h-2.5 w-6 rounded-[3px] bg-[image:var(--gradient-gold)]"
            />
            <span
              className="animate-bob [animation-duration:6s] flex h-24 w-24 items-center justify-center rounded-full bg-[image:var(--gradient-candy)] font-[family-name:var(--font-heading)] text-3xl font-extrabold text-white shadow-[var(--shadow-glow-pink)] sm:h-28 sm:w-28 sm:text-4xl"
              aria-hidden="true"
            >
              {profile.initials}
            </span>
          </div>

          <div className="min-w-0 flex-1 text-center sm:text-left">
            <p className="font-[family-name:var(--font-script)] text-2xl text-[var(--color-brand-pink-dark)]">
              Player profile
            </p>
            <h1
              className="font-[family-name:var(--font-heading)] text-3xl font-extrabold break-words sm:text-5xl"
              style={{ color: 'var(--color-plum)' }}
            >
              {profile.name}
            </h1>

            <p className="mt-2 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-base font-bold text-[var(--color-ink-soft)] sm:justify-start">
              <ShuttlecockIcon
                size={18}
                aria-hidden="true"
                className="text-[var(--color-brand-lilac-dark)]"
              />
              <span>{profile.team.name}</span>
              {profile.partner && (
                <>
                  <span aria-hidden="true" className="hidden text-[var(--color-ink-muted)] sm:inline">
                    ·
                  </span>
                  <span className="font-semibold text-[var(--color-ink-muted)]">
                    partnered with{' '}
                    {profile.partnerHandle ? (
                      <Link
                        href={`/players/${profile.partnerHandle}`}
                        className="font-extrabold text-[var(--color-brand-lilac-dark)] underline decoration-2 underline-offset-4 hover:text-[var(--color-brand-pink-dark)]"
                      >
                        {profile.partner.name}
                      </Link>
                    ) : (
                      <span className="font-extrabold text-[var(--color-plum)]">
                        {profile.partner.name}
                      </span>
                    )}
                  </span>
                </>
              )}
            </p>

            <div className="mt-3 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
              {profile.division && (
                <Chip>
                  <SparkleIcon
                    size={14}
                    aria-hidden="true"
                    className="text-[var(--color-brand-gold-dark)]"
                  />
                  {profile.division.name}
                </Chip>
              )}
              {profile.seed != null && <Chip>Seed #{profile.seed}</Chip>}
              {profile.standing.rank != null && (
                <Chip
                  className={cn(
                    profile.standing.inTopFour &&
                      'bg-[var(--color-success-bg)] text-[var(--color-success)]',
                  )}
                >
                  <MedalIcon size={14} aria-hidden="true" />
                  Rank {profile.standing.rank} of {profile.standing.totalPairs}
                </Chip>
              )}
            </div>
          </div>

          {ribbon && (
            <p className="flex items-center gap-2 self-center rounded-[var(--radius-pill)] sm:self-start bg-[image:var(--gradient-gold)] px-4 py-2 font-[family-name:var(--font-heading)] text-sm font-extrabold text-white shadow-[var(--shadow-lift)]">
              <TrophyIcon size={18} aria-hidden="true" />
              <span>
                {ribbon.emoji} {ribbon.label}
              </span>
            </p>
          )}
        </div>

        <p className="rounded-[var(--radius-lg)] bg-white/80 px-4 py-3 text-sm font-semibold text-[var(--color-ink-soft)]">
          {profile.headline}
        </p>
      </CardBody>
    </Card>
  )
}
