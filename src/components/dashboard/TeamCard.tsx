import Link from 'next/link'
import { Card, CardBody } from '@/components/ui'
import { ShuttlecockIcon, SnowflakeIcon } from '@/components/icons'
import { cn } from '@/lib/cn'
import type { PublicDivisionInfo, PublicTeam } from '@/lib/public-data'

export interface TeamCardProps {
  team: PublicTeam | null
  division: PublicDivisionInfo | null
  partnerNames: string[]
  className?: string
}

/** Your pair: partner, team name, division and seed — or a warm free-agent note. */
export function TeamCard({ team, division, partnerNames, className }: TeamCardProps) {
  return (
    <Card variant="frosted" className={cn('h-full', className)}>
      <CardBody className="flex h-full flex-col gap-3 p-5">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[image:var(--gradient-mint-sky)] text-white">
            <ShuttlecockIcon size={16} />
          </span>
          <h3 className="text-base font-extrabold" style={{ color: 'var(--color-plum)' }}>
            Your pair
          </h3>
        </div>

        {team ? (
          <>
            <p className="font-[family-name:var(--font-heading)] text-2xl leading-tight font-extrabold text-[var(--color-brand-pink-dark)]">
              {team.name}
            </p>
            <dl className="grid grid-cols-2 gap-2">
              <div className="rounded-[var(--radius-lg)] bg-white/80 px-3 py-2">
                <dt className="text-[0.65rem] font-extrabold tracking-widest text-[var(--color-ink-muted)] uppercase">
                  Partner
                </dt>
                <dd className="text-sm font-bold text-[var(--color-plum)]">
                  {partnerNames.length > 0 ? partnerNames.join(' & ') : 'To be confirmed'}
                </dd>
              </div>
              <div className="rounded-[var(--radius-lg)] bg-white/80 px-3 py-2">
                <dt className="text-[0.65rem] font-extrabold tracking-widest text-[var(--color-ink-muted)] uppercase">
                  Seed
                </dt>
                <dd className="text-sm font-bold text-[var(--color-plum)]">
                  {team.seed != null ? `#${team.seed}` : 'Unseeded'}
                </dd>
              </div>
            </dl>
            <p className="text-sm font-semibold text-[var(--color-ink-soft)]">
              {division?.name ?? 'Division to be confirmed'} · single round robin, then the top 4 play the semis.
            </p>
            <Link
              href="/players"
              className="mt-auto text-sm font-extrabold text-[var(--color-brand-lilac-dark)] underline-offset-4 hover:underline"
            >
              See every pair in the draw →
            </Link>
          </>
        ) : (
          <>
            <p className="font-[family-name:var(--font-heading)] text-xl font-extrabold text-[var(--color-brand-lilac-dark)]">
              You&rsquo;re a free agent 🎁
            </p>
            <p className="flex items-start gap-2 text-sm text-[var(--color-ink-soft)]">
              <SnowflakeIcon size={16} className="mt-0.5 shrink-0 text-[var(--color-brand-sky-dark)]" />
              No partner on file yet — and that&rsquo;s completely fine. Plenty of smashers arrive solo and the
              committee happily matches free agents into a pair before the draw.
            </p>
            <Link
              href="/register"
              className="mt-auto text-sm font-extrabold text-[var(--color-brand-pink-dark)] underline-offset-4 hover:underline"
            >
              Add a partner or join the free-agent list →
            </Link>
          </>
        )}
      </CardBody>
    </Card>
  )
}
