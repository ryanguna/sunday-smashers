import type { Metadata } from 'next'
import { loadPublicAnnouncementsFeed } from '@/lib/announcements-server'
import { Badge, Card, CardBody, GradientText, SectionHeading, Snowfall } from '@/components/ui'
import { HollyIcon, ShuttlecockIcon, SnowflakeIcon } from '@/components/icons'
import { AnnouncementFeed } from '@/components/announcements'
import { countPinned } from '@/lib/announcements'
import { formatTournamentDateLabel } from '@/lib/tournament'
import { loadPublicTournamentConfig } from '@/lib/tournament-config'
import { PageGate } from '@/components/PageGate'

export const metadata: Metadata = {
  title: 'Announcements',
  description:
    'Match-day news, draw updates and organiser notices for the Sunday Smashers Christmas Mini Tournament.',
}

export default async function AnnouncementsPage() {
  const { now, announcements } = await loadPublicAnnouncementsFeed()
  const { dates } = await loadPublicTournamentConfig()
  const dateLabel = formatTournamentDateLabel(dates.tournamentDate)
  const pinnedCount = countPinned(announcements)

  return (
    <PageGate pageKey="announcements">
      <main className="relative overflow-hidden">
        <Snowfall />

        <section className="relative z-10 mx-auto max-w-3xl px-4 pt-14 pb-2 sm:px-6">
          <SectionHeading
            level={1}
            eyebrow={
              <span className="inline-flex items-center gap-2">
                <HollyIcon size={16} />
                The noticeboard
              </span>
            }
            title={<GradientText as="span">Announcements</GradientText>}
            description={`Everything the organisers want you to know before the first shuttle goes up on ${dateLabel}.`}
          />

          <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
            <Badge status="info">
              <span className="inline-flex items-center gap-1.5">
                <ShuttlecockIcon size={14} />
                {announcements.length} {announcements.length === 1 ? 'notice' : 'notices'}
              </span>
            </Badge>
            {pinnedCount > 0 && (
              <Badge status="live">
                <span className="inline-flex items-center gap-1.5">
                  <SnowflakeIcon size={14} />
                  {pinnedCount} pinned
                </span>
              </Badge>
            )}
          </div>
        </section>

        <section
          aria-label="Announcements"
          className="relative z-10 mx-auto max-w-3xl px-4 pt-8 pb-16 sm:px-6"
        >
          <AnnouncementFeed announcements={announcements} now={now} />
        </section>

        <section className="relative z-10 mx-auto max-w-3xl px-4 pb-20 sm:px-6">
          <Card variant="outline">
            <CardBody className="flex flex-wrap items-center gap-3">
              <ShuttlecockIcon size={22} className="text-[var(--color-brand-lilac-dark)]" />
              <p className="min-w-0 flex-1 text-sm text-[var(--color-ink-soft)]">
                Got a question that isn&rsquo;t answered here? Grab an organiser at the desk on the
                day, or check the{' '}
                <a
                  href="/rules"
                  className="font-extrabold text-[var(--color-brand-lilac-dark)] underline-offset-4 hover:underline"
                >
                  rules &amp; FAQ
                </a>
                .
              </p>
            </CardBody>
          </Card>
        </section>
      </main>
    </PageGate>
  )
}
