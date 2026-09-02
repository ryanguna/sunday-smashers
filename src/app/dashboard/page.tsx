import type { Metadata } from 'next'
import { Snowfall } from '@/components/ui'
import { AnnouncementsStrip } from '@/components/announcements'
import {
  AwaitingDrawPanel,
  Celebration,
  DashboardGreeting,
  DoubleBookingAlert,
  DutiesList,
  FinishedPanel,
  FixturesList,
  InvitesCard,
  NextDutyCard,
  NextMatchHero,
  NotRegisteredPanel,
  ProfileCard,
  QuickLinks,
  StandingCard,
  StatusCard,
  TeamCard,
} from '@/components/dashboard'
import { requireAuth } from '@/lib/auth'
import { loadPublicTournamentConfig } from '@/lib/tournament-config'
import { loadDashboardData } from './data'

export const metadata: Metadata = {
  title: 'Your dashboard',
  description:
    'Your matches, duties, standings and entry status for the Sunday Smashers Christmas Mini Tournament.',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

/**
 * The player dashboard.
 *
 * Guarded by `requireAuth('/dashboard')`. In demo mode there is no login flow
 * to redirect to (see the note in `src/proxy.ts`), so `requireAuth` resolves to
 * the stand-in player and the page renders the bundled demo dataset instead of
 * bouncing to a login page that can't work. On an unconfigured production
 * deployment it redirects to `/setup` rather than serving that to the public.
 */
export default async function DashboardPage() {
  await requireAuth('/dashboard')

  const { demo, profile, dashboard, announcements, now } = await loadDashboardData()
  const { dates } = await loadPublicTournamentConfig()
  const {
    stage,
    team,
    division,
    partnerNames,
    fixtures,
    next,
    countdown,
    duty,
    dutyCountdown,
    duties,
    doubleBooked,
    record,
    cut,
    podium,
    celebrate,
    registrationView,
    paymentView,
  } = dashboard

  const thenNext = fixtures.find((f) => f.outcome === 'upcoming' && f.match.id !== next?.match.id) ?? null
  const playerName = profile?.full_name ?? 'Smasher'

  const finishedSummary =
    record.played > 0
      ? `You finished with ${record.wins} win${record.wins === 1 ? '' : 's'} and ${record.losses} loss${
          record.losses === 1 ? '' : 'es'
        }, a point difference of ${record.pointDiff > 0 ? '+' : ''}${record.pointDiff}${
          cut ? `, ranked ${cut.rank} in ${division?.name ?? 'your division'}` : ''
        }.`
      : 'Thanks for being part of the Christmas Mini Tournament.'

  return (
    <main className="relative overflow-hidden pb-20">
      <Snowfall />
      <Celebration active={celebrate} />

      <div className="relative z-10 mx-auto flex max-w-5xl flex-col gap-6 px-4 pt-10 sm:px-6 sm:pt-14">
        <DashboardGreeting
          name={playerName}
          stage={stage}
          divisionName={division?.name ?? null}
          demo={demo}
          now={now}
          dates={dates}
        />

        {stage === 'not-registered' && <NotRegisteredPanel />}
        {stage === 'awaiting-draw' && <AwaitingDrawPanel />}
        {stage === 'finished' && <FinishedPanel summary={finishedSummary} />}

        {doubleBooked && <DoubleBookingAlert />}

        {(stage === 'tournament-day' || stage === 'finished') && (
          <div className="grid gap-4 lg:grid-cols-5">
            <NextMatchHero
              fixture={next}
              countdown={countdown}
              thenNext={thenNext}
              className="lg:col-span-3"
            />
            <NextDutyCard duty={duty} countdown={dutyCountdown} className="lg:col-span-2" />
          </div>
        )}

        <section aria-label="Your entry" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <StatusCard title="Registration" view={registrationView} icon="gift" />
          {paymentView && <StatusCard title="Entry fee" view={paymentView} icon="sparkle" />}
          <InvitesCard />
        </section>

        <section aria-label="Your pair" className="grid gap-4 sm:grid-cols-2">
          <TeamCard team={team} division={division} partnerNames={partnerNames} />
          <StandingCard record={record} cut={cut} podium={podium} />
        </section>

        <FixturesList fixtures={fixtures} duties={duties} />

        {duties.length > 0 && <DutiesList duties={duties} />}

        <AnnouncementsStrip announcements={announcements} now={now} limit={3} />

        <QuickLinks profileHref={team && profile ? `/players/${profile.id}` : null} />

        <ProfileCard profile={profile} demo={demo} />
      </div>
    </main>
  )
}
