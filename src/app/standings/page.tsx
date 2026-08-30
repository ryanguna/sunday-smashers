import type { Metadata } from 'next'
import {
  Badge,
  Card,
  CardBody,
  SectionHeading,
  Snowfall,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
  Tabs,
} from '@/components/ui'
import { MedalIcon, SnowflakeIcon } from '@/components/icons'
import { getStandings, tiebreakLabel, type PublicDivisionStandings, type PublicStandingRow } from '@/lib/public-data'
import { cn } from '@/lib/cn'

export const metadata: Metadata = {
  title: 'Standings',
  description:
    'Live round-robin standings for the Sunday Smashers Christmas Mini Tournament — see who is on track for the semi-finals.',
}

export const dynamic = 'force-dynamic'

const QUALIFYING_SPOTS = 4

function pointDiffLabel(diff: number): string {
  if (diff > 0) return `+${diff}`
  return `${diff}`
}

function StandingsTable({ rows }: { rows: PublicStandingRow[] }) {
  return (
    <Table>
      <TableHead>
        <TableRow>
          <TableHeaderCell className="w-14">Rank</TableHeaderCell>
          <TableHeaderCell>Pair</TableHeaderCell>
          <TableHeaderCell className="text-center">P</TableHeaderCell>
          <TableHeaderCell className="text-center">W&ndash;L</TableHeaderCell>
          <TableHeaderCell className="text-center">PF</TableHeaderCell>
          <TableHeaderCell className="text-center">PA</TableHeaderCell>
          <TableHeaderCell className="text-center">+/&minus;</TableHeaderCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {rows.map((row) => {
          const qualifying = row.rank <= QUALIFYING_SPOTS
          return (
            <TableRow
              key={row.teamId}
              className={cn(
                qualifying &&
                  'sm:bg-[image:var(--gradient-mint-sky)]/10 border-l-4 border-l-transparent sm:border-l-[var(--color-brand-mint-dark)]'
              )}
            >
              <TableCell label="Rank">
                <span
                  className={cn(
                    'inline-flex h-8 w-8 items-center justify-center rounded-full text-sm font-extrabold',
                    qualifying
                      ? 'bg-[image:var(--gradient-mint-sky)] text-white shadow-[var(--shadow-glow-mint)]'
                      : 'bg-[var(--color-frost-100)] text-[var(--color-ink-muted)]'
                  )}
                >
                  {row.rank}
                </span>
              </TableCell>
              <TableCell label="Pair">
                <div className="flex flex-col gap-1 text-left">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-[var(--color-plum)]">{row.team.name}</span>
                    {row.team.seed && (
                      <span className="text-xs font-semibold text-[var(--color-ink-muted)]">
                        Seed #{row.team.seed}
                      </span>
                    )}
                    {qualifying && (
                      <Badge status="final" className="text-xs">
                        <MedalIcon size={12} /> Semis
                      </Badge>
                    )}
                    {row.needsAdminDecision && (
                      <Badge status="pending" className="text-xs" title="This tie is not fully separated by the rules and needs an admin decision.">
                        Admin decision needed
                      </Badge>
                    )}
                  </div>
                  <span className="text-xs text-[var(--color-ink-soft)]">
                    {row.team.players.map((p) => p.name).join(' & ')}
                  </span>
                  {row.tiebreak !== 'wins' && (
                    <span
                      className="w-fit rounded-[var(--radius-pill)] bg-[var(--color-brand-lilac-light)]/60 px-2 py-0.5 text-[11px] font-semibold text-[var(--color-brand-lilac-dark)]"
                      title={`Tiebreak rule applied: ${tiebreakLabel(row.tiebreak)}`}
                    >
                      {tiebreakLabel(row.tiebreak)}
                    </span>
                  )}
                </div>
              </TableCell>
              <TableCell label="Played" className="sm:text-center">
                {row.played}
              </TableCell>
              <TableCell label="W-L" className="sm:text-center">
                <span className="font-semibold text-[var(--color-success)]">{row.wins}</span>
                <span className="text-[var(--color-ink-muted)]">&ndash;</span>
                <span className="font-semibold text-[var(--color-danger)]">{row.losses}</span>
              </TableCell>
              <TableCell label="Points for" className="sm:text-center">
                {row.pointsFor}
              </TableCell>
              <TableCell label="Points against" className="sm:text-center">
                {row.pointsAgainst}
              </TableCell>
              <TableCell label="Point difference" className="sm:text-center">
                <span
                  className={cn(
                    'font-semibold',
                    row.pointDiff > 0 && 'text-[var(--color-success)]',
                    row.pointDiff < 0 && 'text-[var(--color-danger)]'
                  )}
                >
                  {pointDiffLabel(row.pointDiff)}
                </span>
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}

function DivisionPanel({ standings }: { standings: PublicDivisionStandings }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-lg)] bg-white/70 px-4 py-3 shadow-[var(--shadow-soft)]">
        <p className="text-sm text-[var(--color-ink-soft)]">
          First to <strong>{standings.division.elimsRules.pointsToWin} points, no deuce</strong>{' '}
          &middot; ranked by wins, ties broken by head-to-head
        </p>
        <div className="flex items-center gap-2 text-xs font-semibold text-[var(--color-brand-mint-dark)]">
          <span className="h-2.5 w-2.5 rounded-full bg-[image:var(--gradient-mint-sky)]" aria-hidden="true" />
          Top {QUALIFYING_SPOTS} qualify for the semis
        </div>
      </div>
      <StandingsTable rows={standings.rows} />
    </div>
  )
}

export default async function StandingsPage() {
  const standings = await getStandings()

  return (
    <main className="relative overflow-hidden pb-20">
      <Snowfall />

      <section className="relative z-10 mx-auto max-w-5xl px-4 pt-14 pb-8 sm:px-6">
        <SectionHeading
          eyebrow="Standings"
          title="Round-Robin Standings"
          description="Every pair plays every other pair once. Wins decide the ranking; the top 4 in each division go through to the semi-finals."
        />
      </section>

      <section aria-label="Division standings" className="relative z-10 mx-auto max-w-5xl px-4 sm:px-6">
        {standings.length === 0 ? (
          <Card variant="frosted" className="mx-auto max-w-md text-center">
            <CardBody>
              <SnowflakeIcon size={32} className="mx-auto mb-3 text-[var(--color-brand-lilac)]" />
              <p className="font-bold text-[var(--color-plum)]">Standings aren&rsquo;t published yet</p>
              <p className="mt-1 text-sm text-[var(--color-ink-soft)]">Check back closer to tournament day.</p>
            </CardBody>
          </Card>
        ) : (
          <Tabs
            items={standings.map((division) => ({
              id: division.division.slug,
              label: division.division.name,
              content: <DivisionPanel standings={division} />,
            }))}
          />
        )}
      </section>
    </main>
  )
}
