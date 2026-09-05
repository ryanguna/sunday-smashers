import type { Metadata } from 'next'
import Link from 'next/link'
import Image from 'next/image'
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
import { loadPublicTournamentConfig } from '@/lib/tournament-config'
import { describeEntryFee, formatEntryFee } from '@/lib/setup'
import { AnnouncementsStrip } from '@/components/announcements'
import { FeaturedPhotoStrip } from '@/components/gallery'
import { loadFeaturedPhotos } from '@/components/gallery/data'
import { WinnersShowcase } from '@/components/awards'
import { loadPublicAnnouncementsFeed } from '@/lib/announcements-server'
import { latestAnnouncements } from '@/lib/announcements'
import { loadSitePageVisibility } from '@/lib/site-pages-server'
import { isPageVisible } from '@/lib/site-pages'
import { hasAnyWinners } from '@/lib/awards'
import { getPublicAwards } from './awards/data'
import { formatTournamentDate, formatTournamentDateLabel } from '@/lib/tournament'
import { howItWorksSteps } from '@/lib/tournament-copy'
import { loadPublicPrizeBoard } from '@/lib/public-prizes'
import type { PublicPrizeBoard } from '@/lib/settings'
import { formatCents, formatList, placingsFor } from '@/lib/settings'
import type { DivisionGender } from '@/lib/supabase/types'

export const metadata: Metadata = {
  title: 'Home',
}

/** Shown until divisions are published — matches the seeded defaults. */
const DEFAULT_DIVISIONS = [
  {
    name: "Men's Doubles",
    icon: RacketIcon,
    description: 'Pair up and battle it out on court for Christmas glory.',
  },
  {
    name: "Women's Doubles",
    icon: ShuttlecockIcon,
    description: 'Smash your way to the podium with the partner we pair you with.',
  },
] as const

/**
 * A division's name and gender are configurable, its blurb is not — there is
 * no field for one. Keyed by gender so a renamed or extra division still gets
 * sensible copy rather than an empty paragraph.
 */
const DIVISION_BLURBS: Record<DivisionGender, { icon: typeof RacketIcon; description: string }> = {
  mens: { icon: RacketIcon, description: 'Pair up and battle it out on court for Christmas glory.' },
  womens: {
    icon: ShuttlecockIcon,
    description: 'Smash your way to the podium with the partner we pair you with.',
  },
  mixed: { icon: ShuttlecockIcon, description: 'One of each — mixed doubles, maximum chaos.' },
  open: { icon: RacketIcon, description: 'Open to all comers. Just bring your best.' },
}

const COUNT_WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six'] as const

function countWord(n: number): string {
  return COUNT_WORDS[n] ?? String(n)
}

function pluralDivisions(n: number): string {
  return `${countWord(n)} division${n === 1 ? '' : 's'}`
}

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

/**
 * Turns the announced prize board into the three headline cards.
 *
 * The static `PRIZES` copy above is the "nothing announced yet" state — it
 * promises cash without naming a figure, because before the committee ticks
 * the switch in Settings > Prizes there is genuinely no confirmed number to
 * print. Once they do, every card states real, configured quantities.
 */
function prizeCardsFor(board: PublicPrizeBoard | null): typeof PRIZES | PrizeCard[] {
  if (!board) return PRIZES

  const loot = board.lootBagItems
    .filter((item) => item.quantity > 0)
    .map((item) => (item.quantity > 1 ? `${item.quantity} × ${item.name}` : item.name))

  // Which placings are actually funded, rather than a hardcoded three. Fourth
  // place was added to the board after this sentence was written, so a card
  // reading "champion, runner-up and third place" sat directly above a table
  // listing a paid 4th — the summary contradicting the detail underneath it.
  const paidPlacings = board.divisionPrizes.length
    ? placingsFor(board.divisionPrizes[0]!)
        .filter((placing) =>
          board.divisionPrizes.every(
            (prize) =>
              (placingsFor(prize).find((row) => row.label === placing.label)?.pairCents ?? 0) > 0,
          ),
        )
        .map((placing) => placing.label.toLowerCase())
    : []

  return [
    {
      name: 'Cash prizes',
      icon: SparkleIcon,
      description: `${formatCents(board.totalPoolCents)} on the table — ${
        paidPlacings.length > 0 ? formatList(paidPlacings) : 'champion, runner-up and third place'
      } paid in every division.`,
    },
    {
      name: 'Trophies & medals',
      icon: TrophyIcon,
      description: `${board.trophyCount} ${board.trophyCount === 1 ? 'trophy' : 'trophies'} and ${board.medalCount} medals waiting on the presentation table.`,
    },
    {
      name: 'Loot bags for everyone',
      icon: GiftIcon,
      description: loot.length
        ? `Every player goes home with ${listToSentence(loot)}.`
        : 'Every single player goes home with a festive Sunday Smashers loot bag.',
    },
  ]
}

interface PrizeCard {
  name: string
  icon: typeof SparkleIcon
  description: string
}

/** "a, b and c" — loot bags read as a sentence, not a comma-separated dump. */
function listToSentence(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? ''
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}


export default async function HomePage() {
  // The landing page doubles as the post-event front page, so it pulls in
  // whatever is live right now. Each strip is self-effacing: announcements
  // and photos render nothing when empty, and the podium only appears once
  // a division has actually been crowned — before match day the countdown
  // stays the hero rather than a row of "to be decided" placeholders.
  const [
    { now, announcements },
    { views: awardViews },
    featuredPhotos,
    tournament,
    prizeBoard,
    pageVisibility,
  ] = await Promise.all([
    loadPublicAnnouncementsFeed(),
    getPublicAwards(),
    loadFeaturedPhotos(),
    loadPublicTournamentConfig(),
    // Null until the committee ticks "Show prize money on the public site"
    // in Settings > Prizes — the static cards below stay as the fallback.
    loadPublicPrizeBoard(),
    loadSitePageVisibility(),
  ])
  // The notice board earns its place on the front page only when it has
  // something to say. An empty "no announcements yet" card above the fold
  // advertises a feature nobody has used rather than the tournament, so the
  // strip appears once the first notice is published — or never, if the
  // committee has switched the notice board off entirely in Settings > Pages.
  const showAnnouncements =
    isPageVisible(pageVisibility, 'announcements') &&
    latestAnnouncements(announcements, 3).length > 0
  const prizeCards = prizeCardsFor(prizeBoard)
  const showWinners = hasAnyWinners(awardViews)
  // Derived from the tournament row, never from the seeded constant: an
  // organiser who moves the date in Settings must see the hero move with it.
  const dateLabel = formatTournamentDateLabel(tournament.dates.tournamentDate)
  const entryFee = describeEntryFee(tournament.entryFeeCents)
  const opensLabel = formatTournamentDate(tournament.dates.preRegistrationOpensAt)
  // Scoring and qualifying places are per-division settings, so the "how it
  // works" copy is generated rather than written — see `tournament-copy.ts`.
  const howItWorks = howItWorksSteps(tournament.divisions)
  const divisionCards =
    tournament.divisions.length > 0
      ? tournament.divisions.map((d) => ({ name: d.name, ...DIVISION_BLURBS[d.gender] }))
      : DEFAULT_DIVISIONS.map((d) => ({ ...d }))
  const eyebrowText = pluralDivisions(divisionCards.length)
  const divisionsEyebrow = eyebrowText.charAt(0).toUpperCase() + eyebrowText.slice(1)

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
        {/* The poster's own mark. It replaces a script-font rendering of the
            name, which never matched the rainbow lettering people recognise
            from the flyer. Sized in `rem` rather than a fixed pixel width so
            it scales with the hero, and `priority` because it is the largest
            element above the fold. */}
        <Image
          src="/brand/logo-primary.png"
          alt="Sunday Smashers"
          width={575}
          height={375}
          priority
          className="mx-auto mt-3 h-auto w-full max-w-[20rem] sm:max-w-[28rem]"
        />
        <GradientText
          as="h1"
          shimmer
          className="mx-auto mt-2 max-w-4xl text-4xl leading-tight sm:text-6xl"
        >
          Something BIG is smashing this Christmas
        </GradientText>
        {/* The kit's hand-drawn underline, used the way its own showcase does:
            beneath a headline, never as a divider. Purely decorative, so it is
            hidden from assistive tech and rendered as a plain <img> — it has no
            layout-shift risk at a fixed height and Next's optimiser has nothing
            to do with an SVG — next/image passes vectors through untouched, so
            the usual <img> warning does not apply here. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand/underline-rainbow.svg"
          alt=""
          aria-hidden="true"
          className="mx-auto mt-2 h-4 w-48 sm:h-5 sm:w-64"
        />
        <p className="mx-auto mt-4 max-w-xl text-lg font-semibold text-[var(--color-ink-soft)]">
          The Christmas battle is coming! 🎄🏸 Join the Sunday Smashers Christmas Mini Tournament —
          <span className="text-[var(--color-brand-pink-dark)]"> SMASH. COMPETE. CELEBRATE.</span>
        </p>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          <div className="inline-flex flex-wrap items-center justify-center gap-2 rounded-[var(--radius-pill)] bg-white/80 px-5 py-2.5 shadow-[var(--shadow-soft)]">
            <ShuttlecockIcon size={18} className="text-[var(--color-brand-pink-dark)]" aria-hidden="true" />
            <span className="font-[family-name:var(--font-heading)] font-bold text-[var(--color-plum)]">
              {dateLabel}
            </span>
          </div>
          {/* "How much?" is the first question anyone asks, and the answer
              used to live in a "what to bring" card most of the way down the
              page. Beside the date, above the register button, is where it is
              actually read — before somebody commits, not after. */}
          {entryFee && (
            <p className="inline-flex flex-wrap items-center justify-center gap-2 rounded-[var(--radius-pill)] bg-white/80 px-5 py-2.5 shadow-[var(--shadow-soft)]">
              <SparkleIcon size={18} className="text-[var(--color-brand-gold-dark)]" aria-hidden="true" />
              <span className="font-[family-name:var(--font-heading)] font-bold text-[var(--color-plum)]">
                Entry {entryFee}
              </span>
            </p>
          )}
        </div>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Button href="/register" size="lg">
            Register to play
          </Button>
          <Button href="/rules" variant="secondary" size="lg">
            Read the rules
          </Button>
        </div>

        <div className="mx-auto mt-10 max-w-md">
          <CountdownSection dates={tournament.dates} />
        </div>
      </section>

      {showWinners ? (
        <section
          aria-labelledby="winners-heading"
          className="relative z-10 mx-auto max-w-6xl px-4 pb-4 sm:px-6"
        >
          <SectionHeading
            eyebrow="Champions"
            title={<span id="winners-heading">On the podium</span>}
          />
          <div className="mt-6">
            <WinnersShowcase divisions={awardViews} variant="compact" />
          </div>
        </section>
      ) : null}

      {showAnnouncements ? (
        <section
          aria-label="Latest announcements"
          className="relative z-10 mx-auto max-w-6xl px-4 pb-4 sm:px-6"
        >
          <AnnouncementsStrip announcements={announcements} now={now} />
        </section>
      ) : null}

      {/* ---------------------------------------------------------------- */}
      {/* Divisions                                                        */}
      {/* ---------------------------------------------------------------- */}
      <section aria-labelledby="divisions-heading" className="relative z-10 mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <SectionHeading
          eyebrow={divisionsEyebrow}
          title={<span id="divisions-heading">Pick your battlefield</span>}
          description={`Sunday Smashers runs ${countWord(divisionCards.length)} doubles ${
            divisionCards.length === 1 ? 'division' : 'divisions'
          } this Christmas.`}
        />
        <div className="mt-10 grid gap-6 sm:grid-cols-2">
          {divisionCards.map(({ name, icon: Icon, description }) => (
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
          description={
            prizeBoard
              ? `${formatCents(prizeBoard.totalPoolCents)} in cash across every division, plus silverware and a loot bag for every player.`
              : undefined
          }
        />
        {prizeBoard && (
          // The pool is budgeted against an entry count nobody has yet, so the
          // figure genuinely can move. Saying so here — next to the number, not
          // buried in a footer — is the difference between a committee that
          // adjusted a projection and one that appears to have quietly reduced
          // the prize money after people entered.
          <p className="mt-3 inline-flex items-center gap-2 rounded-[var(--radius-pill)] bg-[var(--color-brand-gold-light)]/60 px-3 py-1.5 text-xs font-extrabold text-[var(--color-brand-gold-dark)]">
            <SparkleIcon size={14} aria-hidden="true" />
            Total prize pool is subject to change
          </p>
        )}
        <div className="mt-10 grid gap-6 sm:grid-cols-3">
          {prizeCards.map(({ name, icon: Icon, description }) => (
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

        {prizeBoard && prizeBoard.divisionPrizes.length > 0 && (
          <div className="mt-8">
            <p className="text-sm text-[var(--color-ink-soft)]">
              Prize money by division and placing. Each placing is a pair, and the figure shown is{' '}
              <strong className="text-[var(--color-plum)]">what the pair takes home</strong> — split
              evenly between both partners.
            </p>
            {/* Cards, not a table.

                This was a five-column table in a horizontally scrolling box.
                On a phone — which is where almost everyone reads this — the
                money was off the right-hand edge behind a scroll gesture
                nothing hinted at, so the prize board looked like it listed
                division names and nothing else. A table earns its keep when
                you compare down a column; here there are two rows, and what
                people actually want is "what do I get if I win". One card per
                division answers that without moving anything off screen. */}
            <ul className="mt-4 grid gap-4 sm:grid-cols-2">
              {prizeBoard.divisionPrizes.map((prize) => (
                <li key={prize.divisionId}>
                  <Card variant="frosted" className="h-full">
                    <CardBody>
                      <h3 className="text-lg font-extrabold text-[var(--color-plum)]">
                        {prize.divisionName}
                      </h3>
                      <dl className="mt-3 space-y-1.5">
                        {placingsFor(prize).map(({ label, medal, pairCents, perPlayerCents }) => (
                          <div
                            key={label}
                            className="flex items-baseline gap-3 rounded-[var(--radius-md)] bg-white/70 px-3 py-2"
                          >
                            <dt className="flex min-w-0 items-baseline gap-2 font-semibold text-[var(--color-ink)]">
                              <span aria-hidden="true">{medal}</span>
                              {label}
                            </dt>
                            <dd className="ml-auto shrink-0 text-right font-extrabold tabular-nums text-[var(--color-plum)]">
                              {/* 4th place was added after the prizes were
                                  first budgeted, so an unset amount is "not
                                  decided", not "you get nothing" — a $0 next
                                  to real money reads as a broken page. */}
                              {pairCents > 0 ? (
                                <>
                                  {formatCents(pairCents)}
                                  {/* The cash is handed out in envelopes, one
                                      per player, so the split is worth stating
                                      rather than leaving each partner to halve
                                      the headline in their head. */}
                                  <span className="block text-xs font-semibold text-[var(--color-ink-muted)]">
                                    {formatCents(perPlayerCents)} each
                                  </span>
                                </>
                              ) : (
                                'To be confirmed'
                              )}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    </CardBody>
                  </Card>
                </li>
              ))}
            </ul>
          </div>
        )}
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
          {howItWorks.map(({ step, title, description }) => (
            <li key={step}>
              <Card className="h-full">
                <CardHeader>
                  <span
                    aria-hidden="true"
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[image:var(--gradient-candy)] font-[family-name:var(--font-heading)] font-extrabold text-[var(--color-plum)]"
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
              <p className="mt-2 text-sm">{dateLabel}. Pre-registration opens{' '}
                {opensLabel}.
              </p>
            </CardBody>
          </Card>
          <Card variant="outline">
            <CardBody>
              <h3 className="font-extrabold text-[var(--color-plum)]">📍 Venue</h3>
              {tournament.venueName || tournament.venueAddress ? (
                <p className="mt-2 text-sm">
                  {tournament.venueName && (
                    <span className="font-semibold">{tournament.venueName}</span>
                  )}
                  {tournament.venueName && tournament.venueAddress && <br />}
                  {tournament.venueAddress && (
                    <a
                      className="underline decoration-dotted underline-offset-2 hover:text-[var(--color-brand-pink-dark)]"
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                        [tournament.venueName, tournament.venueAddress].filter(Boolean).join(', '),
                      )}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {tournament.venueAddress}
                    </a>
                  )}
                  {tournament.doorsOpenAt && (
                    <>
                      <br />
                      Doors open{' '}
                      {new Date(tournament.doorsOpenAt).toLocaleTimeString('en-AU', {
                        hour: 'numeric',
                        minute: '2-digit',
                        timeZone: 'Australia/Sydney',
                      })}
                      .
                    </>
                  )}
                </p>
              ) : (
                <p className="mt-2 text-sm">
                  More details to be revealed soon — check back here or watch for an announcement.
                </p>
              )}
            </CardBody>
          </Card>
          <Card variant="outline">
            <CardBody>
              <h3 className="font-extrabold text-[var(--color-plum)]">🎒 What to bring</h3>
              <p className="mt-2 text-sm">
                Your own racket, non-marking court shoes, a water bottle and your festive spirit.
                Shuttles are provided.
                {tournament.entryFeeCents != null && (
                  <>
                    {' '}
                    Entry is{' '}
                    <span className="font-semibold">
                      {formatEntryFee(tournament.entryFeeCents)}
                    </span>{' '}
                    per player.
                  </>
                )}
              </p>
            </CardBody>
          </Card>
        </div>

        {(tournament.contactName || tournament.contactPhone || tournament.contactEmail) && (
          <p
            id="contact"
            className="mt-6 scroll-mt-24 text-center text-sm text-[var(--color-ink-muted)]"
          >
            Questions? Ask{' '}
            <span className="font-semibold text-[var(--color-plum)]">
              {tournament.contactName ?? 'the committee'}
            </span>
            {tournament.contactPhone && (
              <>
                {' '}
                on{' '}
                <a className="underline underline-offset-2" href={`tel:${tournament.contactPhone.replace(/\s+/g, '')}`}>
                  {tournament.contactPhone}
                </a>
              </>
            )}
            {tournament.contactEmail && (
              <>
                {' '}
                or at{' '}
                <a className="underline underline-offset-2" href={`mailto:${tournament.contactEmail}`}>
                  {tournament.contactEmail}
                </a>
              </>
            )}
            .
          </p>
        )}
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* Gallery teaser — renders nothing until photos are approved        */}
      {/* ---------------------------------------------------------------- */}
      {featuredPhotos.length > 0 ? (
        <section
          aria-labelledby="gallery-heading"
          className="relative z-10 mx-auto max-w-6xl px-4 py-6 sm:px-6"
        >
          <SectionHeading
            eyebrow="From the courts"
            title={<span id="gallery-heading">Moments worth framing</span>}
          />
          <div className="mt-6">
            <FeaturedPhotoStrip />
          </div>
        </section>
      ) : null}

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
              Enter on your own — the committee pairs everyone up before the draw.
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <Button href="/register" variant="festive" size="lg">
                Register to play
              </Button>
            </div>
          </CardBody>
        </Card>
      </section>
    </main>
  )
}
