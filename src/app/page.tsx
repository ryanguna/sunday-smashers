'use client'

import { useState } from 'react'
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  Confetti,
  Countdown,
  EmptyState,
  GradientText,
  Modal,
  SectionHeading,
  Skeleton,
  Snowfall,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
  Tabs,
  ToastProvider,
  useToast,
} from '@/components/ui'
import {
  BaubleIcon,
  GiftIcon,
  HollyIcon,
  MedalIcon,
  RacketIcon,
  ShuttlecockIcon,
  SnowflakeIcon,
  SparkleIcon,
  TrophyIcon,
} from '@/components/icons'

const TOURNAMENT_DATE = '2026-12-13T09:00:00+11:00'

function ToastDemoButtons() {
  const { toast } = useToast()
  return (
    <div className="flex flex-wrap gap-3">
      <Button
        variant="secondary"
        size="sm"
        onClick={() => toast({ title: 'Match confirmed!', description: 'Court 2 · 10:30am', variant: 'success' })}
      >
        Success toast
      </Button>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => toast({ title: 'Payment pending', description: 'Please pay before Dec 6', variant: 'warning' })}
      >
        Warning toast
      </Button>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => toast({ title: 'Ho ho ho!', description: 'You just won the raffle 🎁', variant: 'festive' })}
      >
        Festive toast
      </Button>
    </div>
  )
}

function ShowcaseContent() {
  const [modalOpen, setModalOpen] = useState(false)
  const [confettiActive, setConfettiActive] = useState(false)

  function celebrate() {
    setConfettiActive(true)
    window.setTimeout(() => setConfettiActive(false), 2200)
  }

  const tabItems = [
    {
      id: 'standings',
      label: "Men's Doubles",
      content: (
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>Team</TableHeaderCell>
              <TableHeaderCell>Played</TableHeaderCell>
              <TableHeaderCell>Won</TableHeaderCell>
              <TableHeaderCell>Status</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            <TableRow>
              <TableCell label="Team">The Smashers</TableCell>
              <TableCell label="Played">3</TableCell>
              <TableCell label="Won">3</TableCell>
              <TableCell label="Status">
                <Badge status="live">Live</Badge>
              </TableCell>
            </TableRow>
            <TableRow>
              <TableCell label="Team">Rally Reindeer</TableCell>
              <TableCell label="Played">3</TableCell>
              <TableCell label="Won">2</TableCell>
              <TableCell label="Status">
                <Badge status="approved">Approved</Badge>
              </TableCell>
            </TableRow>
            <TableRow>
              <TableCell label="Team">Frosty Smashes</TableCell>
              <TableCell label="Played">3</TableCell>
              <TableCell label="Won">0</TableCell>
              <TableCell label="Status">
                <Badge status="forfeit">Forfeit</Badge>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      ),
    },
    {
      id: 'women',
      label: "Women's Doubles",
      content: (
        <EmptyState
          title="No matches scheduled yet"
          description="Fixtures will appear here once registration closes."
          action={<Button size="sm">Register a team</Button>}
        />
      ),
    },
  ]

  return (
    <main className="relative mx-auto max-w-5xl px-4 py-12 sm:px-6 sm:py-16">
      <Snowfall />
      <Confetti active={confettiActive} />

      {/* Hero */}
      <section className="relative z-10 text-center">
        <p className="font-[family-name:var(--font-script)] text-3xl text-[var(--color-brand-pink-dark)] sm:text-4xl">
          Sunday Smashers
        </p>
        <GradientText as="h1" shimmer className="mt-2 block text-5xl leading-tight sm:text-7xl">
          Something BIG is smashing this Christmas
        </GradientText>
        <p className="mx-auto mt-4 max-w-xl text-lg text-[var(--color-ink-soft)]">
          Christmas Mini Tournament · Men&apos;s &amp; Women&apos;s Doubles · 13 December 2026
        </p>

        <div className="mt-8 flex justify-center">
          <Countdown target={TOURNAMENT_DATE} />
        </div>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Button size="lg">Register your team</Button>
          <Button variant="festive" size="lg" onClick={celebrate}>
            Celebrate 🎉
          </Button>
          <Button variant="secondary" size="lg" onClick={() => setModalOpen(true)}>
            Read the rules
          </Button>
        </div>
      </section>

      {/* Icon row */}
      <section className="relative z-10 mt-16 flex flex-wrap items-center justify-center gap-6 text-[var(--color-brand-lilac-dark)]">
        {[ShuttlecockIcon, RacketIcon, SnowflakeIcon, HollyIcon, BaubleIcon, TrophyIcon, MedalIcon, GiftIcon, SparkleIcon].map(
          (Icon, i) => (
            <Icon key={i} size={30} className="animate-bob" style={{ animationDelay: `${i * 0.15}s` }} />
          )
        )}
      </section>

      {/* Cards */}
      <section className="relative z-10 mt-16">
        <SectionHeading
          eyebrow="Style guide"
          title="Component showcase"
          description="Temporary style guide rendering every design-system primitive for visual verification."
        />

        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <Card variant="default" interactive>
            <CardHeader>
              <h3 className="text-lg font-bold text-[var(--color-plum)]">Default card</h3>
              <TrophyIcon className="text-[var(--color-brand-gold-dark)]" />
            </CardHeader>
            <CardBody>Standard white card with soft shadow — hover to feel the lift.</CardBody>
            <CardFooter>
              <Badge status="final">Final</Badge>
              <Badge status="paid">Paid</Badge>
            </CardFooter>
          </Card>

          <Card variant="frosted">
            <CardHeader>
              <h3 className="text-lg font-bold text-[var(--color-plum)]">Frosted glass</h3>
              <SnowflakeIcon className="text-[var(--color-brand-sky-dark)]" />
            </CardHeader>
            <CardBody>Semi-transparent, blurred backdrop — great over the snowfall layer.</CardBody>
          </Card>

          <Card variant="candy-stripe">
            <CardHeader>
              <h3 className="text-lg font-bold text-[var(--color-plum)]">Candy-striped border</h3>
              <GiftIcon className="text-[var(--color-brand-pink-dark)]" />
            </CardHeader>
            <CardBody>A festive diagonal-striped border, poster-inspired.</CardBody>
          </Card>
        </div>
      </section>

      {/* Buttons */}
      <section className="relative z-10 mt-16">
        <SectionHeading title="Buttons" align="left" />
        <div className="mt-6 flex flex-wrap gap-3">
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">Danger</Button>
          <Button variant="festive">Festive</Button>
          <Button loading>Loading</Button>
          <Button disabled>Disabled</Button>
          <Button href="#" variant="secondary">
            As link
          </Button>
        </div>
      </section>

      {/* Badges */}
      <section className="relative z-10 mt-16">
        <SectionHeading title="Status badges" align="left" />
        <div className="mt-6 flex flex-wrap gap-2">
          <Badge status="pending">Pending</Badge>
          <Badge status="approved">Approved</Badge>
          <Badge status="paid">Paid</Badge>
          <Badge status="unpaid">Unpaid</Badge>
          <Badge status="live">Live</Badge>
          <Badge status="final">Final</Badge>
          <Badge status="forfeit">Forfeit</Badge>
          <Badge status="info">Info</Badge>
        </div>
      </section>

      {/* Tabs + Table */}
      <section className="relative z-10 mt-16">
        <SectionHeading title="Standings" align="left" />
        <div className="mt-6">
          <Tabs items={tabItems} />
        </div>
      </section>

      {/* Toast */}
      <section className="relative z-10 mt-16">
        <SectionHeading title="Toasts" align="left" />
        <div className="mt-6">
          <ToastDemoButtons />
        </div>
      </section>

      {/* Loading states */}
      <section className="relative z-10 mt-16">
        <SectionHeading title="Loading states" align="left" />
        <div className="mt-6 flex flex-wrap items-center gap-6">
          <Spinner size={32} />
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-24 w-24" />
        </div>
      </section>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Tournament rules"
        description="Full rules and scoring for the Christmas Mini Tournament."
      >
        <ol className="list-decimal space-y-1 pl-5 text-[var(--color-ink-soft)]">
          <li>Best of 3 games to 21 points.</li>
          <li>Round-robin group stage, top 2 advance.</li>
          <li>Forfeits count as a 0–21, 0–21 loss.</li>
        </ol>
        <div className="mt-6 flex justify-end">
          <Button onClick={() => setModalOpen(false)}>Got it</Button>
        </div>
      </Modal>
    </main>
  )
}

export default function Home() {
  return (
    <ToastProvider>
      <ShowcaseContent />
    </ToastProvider>
  )
}
