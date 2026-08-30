import type { Metadata } from 'next'
import Link from 'next/link'
import { Button, Card, CardBody, CardHeader, GradientText, SectionHeading, Snowfall } from '@/components/ui'
import {
  GiftIcon,
  HollyIcon,
  RacketIcon,
  ShuttlecockIcon,
  SparkleIcon,
  TrophyIcon,
} from '@/components/icons'
import { CountdownSection } from '@/components/CountdownSection'
import { PRE_REGISTRATION_OPENS_AT, TOURNAMENT_DATE_LABEL } from '@/lib/tournament'

export const metadata: Metadata = {
  title: 'Home',
}

const DIVISIONS = [
  {
    name: "Men's Doubles",
    icon: RacketIcon,
    description: 'Pair up and battle it out on court for Christmas glory.',
  },
  {
    name: "Women's Doubles",
    icon: ShuttlecockIcon,
    description: 'Bring your best partner and smash your way to the podium.',
  },
] as const

const PRIZES = [
  {
    name: 'Cash prizes',
    icon: SparkleIcon,
    description: 'Winning pairs take home cold hard cash — details announced soon.',
  },
  {
    name: 'Trophies & medals',
    icon: TrophyIcon,
    description: 'Championship, 3rd place and division trophies plus medals for finalists.',
  },
  {
    name: 'Loot bags for everyone',
    icon: GiftIcon,
    description: 'Every single player goes home with a festive Sunday Smashers loot bag.',
  },
] as const

const HOW_IT_WORKS = [
  {
    step: '1',
    title: 'Round robin',
    description:
      'Every pair in your division plays every other pair once, first to 15 points (no deuce). Ranking is by wins, with head-to-head deciding ties.',
  },
  {
    step: '2',
    title: 'Top 4 qualify',
    description:
      'The top 4 ranked pairs move on to the semi-finals: Rank 1 vs Rank 4, and Rank 2 vs Rank 3.',
  },
  {
    step: '3',
    title: 'Semi-finals',
    description: 'Semis are first to 21 points (no deuce) — winner takes their spot in the final.',
  },
  {
    step: '4',
    title: 'Battle for 3rd & Championship',
    description:
      'Semi-final losers play the Battle for 3rd; semi-final winners play the Championship match for the title.',
  },
] as const

export default function HomePage() {
  return (
    <main className="relative overflow-hidden">
      <Snowfall />

      {/* ---------------------------------------------------------------- */}
      {/* Hero                                                              */}
      {/* ---------------------------------------------------------------- */}
      <section className="relative z-10 mx-auto max-w-6xl px-4 pt-16 pb-14 text-center sm:px-6 sm:pt-24 sm:pb-20">
        <p className="animate-fade-in font-[family-name:var(--font-heading)] text-sm font-bold uppercase tracking-[0.2em] text-[var(--color-brand-lilac-dark)]">
          Sunday Smashers presents
        </p>
        <p className="mt-3 font-[family-name:var(--font-script)] text-4xl text-[var(--color-brand-pink-dark)] sm:text-5xl">
          Sunday Smashers
        </p>
        <GradientText
          as="h1"
          shimmer
          className="mx-auto mt-2 max-w-4xl text-4xl leading-tight sm:text-6xl"
        >
          Something BIG is smashing this Christmas
        </GradientText>
        <p className="mx-auto mt-4 max-w-xl text-lg font-semibold text-[var(--color-ink-soft)]">
          The Christmas battle is coming! 🎄🏸 Join the Sunday Smashers Christmas Mini Tournament —
          <span className="text-[var(--color-brand-pink-dark)]"> SMASH. COMPETE. CELEBRATE.</span>
        </p>

        <div className="mt-6 inline-flex flex-wrap items-center justify-center gap-2 rounded-[var(--radius-pill)] bg-white/80 px-5 py-2.5 shadow-[var(--shadow-soft)]">
          <ShuttlecockIcon size={18} className="text-[var(--color-brand-pink-dark)]" aria-hidden="true" />
          <span className="font-[family-name:var(--font-heading)] font-bold text-[var(--color-plum)]">
            {TOURNAMENT_DATE_LABEL}
          </span>
        </div>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Button href="/register" size="lg">
            Register your pair
          </Button>
          <Button href="/rules" variant="secondary" size="lg">
            Read the rules
          </Button>
        </div>

        <div className="mx-auto mt-10 max-w-md">
          <CountdownSection />
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* Divisions                                                        */}
      {/* ---------------------------------------------------------------- */}
      <section aria-labelledby="divisions-heading" className="relative z-10 mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <SectionHeading
          eyebrow="Two divisions"
          title={<span id="divisions-heading">Pick your battlefield</span>}
          description="Sunday Smashers runs two doubles divisions this Christmas."
        />
        <div className="mt-10 grid gap-6 sm:grid-cols-2">
          {DIVISIONS.map(({ name, icon: Icon, description }) => (
            <Card key={name} variant="candy-stripe" interactive className="text-center">
              <CardBody>
                <span
                  aria-hidden="true"
                  className="mx-auto mb-4 flex h-16 w-16 animate-bob items-center justify-center rounded-full bg-[image:var(--gradient-mint-sky)] text-white shadow-[var(--shadow-glow-mint)]"
                >
                  <Icon size={30} />
                </span>
                <h3 className="text-xl font-extrabold text-[var(--color-plum)]">{name}</h3>
                <p className="mt-2 text-[var(--color-ink-soft)]">{description}</p>
              </CardBody>
            </Card>
          ))}
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* Prizes                                                           */}
      {/* ---------------------------------------------------------------- */}
      <section aria-labelledby="prizes-heading" className="relative z-10 mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <SectionHeading
          eyebrow="What's on offer"
          title={<span id="prizes-heading">Prizes worth smashing for</span>}
        />
        <div className="mt-10 grid gap-6 sm:grid-cols-3">
          {PRIZES.map(({ name, icon: Icon, description }) => (
            <Card key={name} variant="frosted" className="text-center">
              <CardBody>
                <span
                  aria-hidden="true"
                  className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[image:var(--gradient-gold)] text-[var(--color-plum)] shadow-[var(--shadow-soft)]"
                >
                  <Icon size={26} />
                </span>
                <h3 className="text-lg font-extrabold text-[var(--color-plum)]">{name}</h3>
                <p className="mt-2 text-sm text-[var(--color-ink-soft)]">{description}</p>
              </CardBody>
            </Card>
          ))}
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* How it works                                                     */}
      {/* ---------------------------------------------------------------- */}
      <section aria-labelledby="how-heading" className="relative z-10 mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <SectionHeading
          eyebrow="Format"
          title={<span id="how-heading">How it works</span>}
          description="Round robin, then the top 4 fight it out for the Christmas crown."
        />
        <ol className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {HOW_IT_WORKS.map(({ step, title, description }) => (
            <li key={step}>
              <Card className="h-full">
                <CardHeader>
                  <span
                    aria-hidden="true"
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[image:var(--gradient-candy)] font-[family-name:var(--font-heading)] font-extrabold text-white"
                  >
                    {step}
                  </span>
                  <h3 className="text-base font-extrabold text-[var(--color-plum)]">{title}</h3>
                </CardHeader>
                <CardBody>
                  <p className="text-sm">{description}</p>
                </CardBody>
              </Card>
            </li>
          ))}
        </ol>
        <p className="mx-auto mt-6 max-w-2xl text-center text-sm text-[var(--color-ink-muted)]">
          Full officiating, scoresheet and forfeit rules are on the{' '}
          <Link href="/rules" className="font-semibold text-[var(--color-brand-pink-dark)] underline underline-offset-2">
            Rules &amp; Info
          </Link>{' '}
          page.
        </p>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* Venue / date / what to bring                                     */}
      {/* ---------------------------------------------------------------- */}
      <section aria-labelledby="venue-heading" className="relative z-10 mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <SectionHeading eyebrow="The details" title={<span id="venue-heading">Save the date</span>} />
        <div className="mt-10 grid gap-6 sm:grid-cols-3">
          <Card variant="outline">
            <CardBody>
              <h3 className="font-extrabold text-[var(--color-plum)]">📅 Date</h3>
              <p className="mt-2 text-sm">{TOURNAMENT_DATE_LABEL}. Pre-registration opens{' '}
                {new Date(PRE_REGISTRATION_OPENS_AT).toLocaleDateString('en-AU', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}.
              </p>
            </CardBody>
          </Card>
          <Card variant="outline">
            <CardBody>
              <h3 className="font-extrabold text-[var(--color-plum)]">📍 Venue</h3>
              <p className="mt-2 text-sm">
                More details to be revealed soon — check back here or watch for an announcement.
              </p>
            </CardBody>
          </Card>
          <Card variant="outline">
            <CardBody>
              <h3 className="font-extrabold text-[var(--color-plum)]">🎒 What to bring</h3>
              <p className="mt-2 text-sm">
                Your own racket, non-marking court shoes, a water bottle and your festive spirit.
                Shuttles are provided.
              </p>
            </CardBody>
          </Card>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* Closing CTA                                                      */}
      {/* ---------------------------------------------------------------- */}
      <section className="relative z-10 mx-auto max-w-4xl px-4 pb-20 text-center sm:px-6">
        <Card variant="candy-stripe" className="px-6 py-10">
          <CardBody>
            <HollyIcon size={28} className="mx-auto mb-3 text-[var(--color-brand-holly)] animate-twinkle" aria-hidden="true" />
            <h2 className="text-2xl font-extrabold text-[var(--color-plum)] sm:text-3xl">
              Let the Christmas smashes begin!
            </h2>
            <p className="mx-auto mt-2 max-w-md text-[var(--color-ink-soft)]">
              Grab a partner and register your pair before the draw fills up.
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <Button href="/register" variant="festive" size="lg">
                Register your pair
              </Button>
            </div>
          </CardBody>
        </Card>
      </section>
    </main>
  )
}
