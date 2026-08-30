import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { Card, CardBody, EmptyState, SectionHeading, Snowfall, Tabs } from '@/components/ui'
import { MedalIcon, TrophyIcon } from '@/components/icons'
import { MatchCard } from '@/components/results'
import { getBrackets, teamDisplayName, type PublicBracket, type PublicKnockoutFixture, type PublicTeam } from '@/lib/public-data'
import { cn } from '@/lib/cn'

export const metadata: Metadata = {
  title: 'Bracket',
  description:
    'The semis and finals bracket for the Sunday Smashers Christmas Mini Tournament — M1, M2, Battle for 3rd and the Championship.',
}

export const dynamic = 'force-dynamic'

function FixtureSlot({ fixture, side }: { fixture: PublicKnockoutFixture; side: 'A' | 'B' }) {
  const team = side === 'A' ? fixture.teamA : fixture.teamB
  const source = side === 'A' ? fixture.sourceA : fixture.sourceB
  const isWinner = fixture.match?.winnerTeamId != null && team != null && fixture.match.winnerTeamId === team.id

  return (
    <div
      className={cn(
        'flex items-center justify-between gap-2 rounded-[var(--radius-md)] px-3 py-2 text-sm',
        isWinner ? 'bg-[var(--color-success-bg)] font-bold' : 'bg-[var(--color-frost-100)]/70'
      )}
    >
      <span className={cn('truncate', !team && 'italic text-[var(--color-ink-muted)]')}>
        {teamDisplayName(team, source)}
      </span>
      {fixture.match && (fixture.match.status === 'in_progress' || fixture.match.status === 'completed') && (
        <span className="shrink-0 font-extrabold tabular-nums text-[var(--color-plum)]">
          {side === 'A' ? fixture.match.scoreA : fixture.match.scoreB}
        </span>
      )}
    </div>
  )
}

function FixtureNode({ fixture }: { fixture: PublicKnockoutFixture }) {
  return (
    <Card variant={fixture.key === 'FINAL' ? 'candy-stripe' : 'default'} className="w-full max-w-xs">
      <CardBody className="flex flex-col gap-2">
        <p className="text-center text-xs font-bold uppercase tracking-wide text-[var(--color-brand-lilac-dark)]">
          {fixture.label}
        </p>
        <FixtureSlot fixture={fixture} side="A" />
        <FixtureSlot fixture={fixture} side="B" />
        {fixture.match && (
          <p className="text-center text-[10px] text-[var(--color-ink-muted)]">
            {fixture.match.court ?? 'Court TBC'} &middot; first to {fixture.match.pointsToWin}
          </p>
        )}
      </CardBody>
    </Card>
  )
}

function Podium({ placings }: { placings: PublicBracket['placings'] }) {
  const spots: { label: string; team: PublicTeam | null; icon: ReactNode; tone: string }[] = [
    { label: 'Champion', team: placings.champion, icon: <TrophyIcon size={22} />, tone: 'bg-[image:var(--gradient-gold)] text-white' },
    { label: 'Runner-up', team: placings.runnerUp, icon: <MedalIcon size={22} />, tone: 'bg-[var(--color-brand-lilac-light)] text-[var(--color-brand-lilac-dark)]' },
    { label: '3rd place', team: placings.third, icon: <MedalIcon size={22} />, tone: 'bg-[var(--color-brand-mint-light)] text-[var(--color-brand-mint-dark)]' },
    { label: '4th place', team: placings.fourth, icon: <MedalIcon size={22} />, tone: 'bg-[var(--color-frost-100)] text-[var(--color-ink-muted)]' },
  ]

  if (!placings.champion) return null

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {spots.map((spot) => (
        <Card key={spot.label} variant="frosted" className="text-center">
          <CardBody className="flex flex-col items-center gap-2">
            <span className={cn('flex h-11 w-11 items-center justify-center rounded-full', spot.tone)}>
              {spot.icon}
            </span>
            <p className="text-xs font-bold uppercase tracking-wide text-[var(--color-ink-muted)]">{spot.label}</p>
            <p className="font-extrabold text-[var(--color-plum)]">{spot.team?.name ?? 'TBC'}</p>
          </CardBody>
        </Card>
      ))}
    </div>
  )
}

function DivisionBracket({ bracket }: { bracket: PublicBracket }) {
  const m1 = bracket.fixtures.find((f) => f.key === 'M1')
  const m2 = bracket.fixtures.find((f) => f.key === 'M2')
  const third = bracket.fixtures.find((f) => f.key === 'THIRD')
  const final = bracket.fixtures.find((f) => f.key === 'FINAL')

  return (
    <div className="flex flex-col gap-8">
      {bracket.placings.champion && <Podium placings={bracket.placings} />}

      <div className="grid gap-6 lg:grid-cols-[1fr_auto_1fr]">
        <div className="flex flex-col items-center gap-4">
          <p className="text-xs font-bold uppercase tracking-wide text-[var(--color-ink-muted)]">Semi-Finals</p>
          {m1 && <FixtureNode fixture={m1} />}
          {m2 && <FixtureNode fixture={m2} />}
        </div>

        <div className="hidden items-center justify-center lg:flex" aria-hidden="true">
          <div className="h-32 w-10 rounded-r-full border-y-2 border-r-2 border-dashed border-[var(--color-brand-lilac-light)]" />
        </div>

        <div className="flex flex-col items-center gap-4">
          <p className="text-xs font-bold uppercase tracking-wide text-[var(--color-ink-muted)]">Finals Day</p>
          {final && <FixtureNode fixture={final} />}
          {third && <FixtureNode fixture={third} />}
        </div>
      </div>

      {bracket.fixtures.some((f) => f.match) && (
        <div className="grid gap-3 sm:grid-cols-2">
          {bracket.fixtures
            .filter((f) => f.match)
            .map((f) => (
              <MatchCard key={f.key} match={f.match!} showDetails />
            ))}
        </div>
      )}
    </div>
  )
}

export default async function BracketPage() {
  const brackets = await getBrackets()

  return (
    <main className="relative overflow-hidden pb-20">
      <Snowfall />

      <section className="relative z-10 mx-auto max-w-5xl px-4 pt-14 pb-8 sm:px-6">
        <SectionHeading
          eyebrow="Bracket"
          title="Semis & Finals"
          description="Top 4 from the round robin: M1 is Rank 1 v Rank 4, M2 is Rank 2 v Rank 3. Losers battle for 3rd, winners play the championship — first to 21, no deuce."
        />
      </section>

      <section aria-label="Knockout brackets" className="relative z-10 mx-auto max-w-5xl px-4 sm:px-6">
        {brackets.length === 0 ? (
          <EmptyState icon={<TrophyIcon size={30} />} title="The bracket isn't set yet" description="It fills in once the round robin standings are final." />
        ) : (
          <Tabs
            items={brackets.map((bracket) => ({
              id: bracket.division.slug,
              label: bracket.division.name,
              content: <DivisionBracket bracket={bracket} />,
            }))}
          />
        )}
      </section>
    </main>
  )
}
