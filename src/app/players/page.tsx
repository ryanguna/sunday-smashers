import type { Metadata } from 'next'
import { Badge, Card, CardBody, EmptyState, SectionHeading, Snowfall } from '@/components/ui'
import { HollyIcon } from '@/components/icons'
import { getPlayersDirectory } from '@/lib/public-data'

export const metadata: Metadata = {
  title: 'Players & Teams',
  description:
    'The public players and teams directory for the Sunday Smashers Christmas Mini Tournament — pairs, divisions and standings so far.',
}

export const dynamic = 'force-dynamic'

export default async function PlayersPage() {
  const directory = await getPlayersDirectory()

  const byDivision = new Map<string, typeof directory>()
  for (const entry of directory) {
    const bucket = byDivision.get(entry.team.division)
    if (bucket) bucket.push(entry)
    else byDivision.set(entry.team.division, [entry])
  }

  return (
    <main className="relative overflow-hidden pb-20">
      <Snowfall />

      <section className="relative z-10 mx-auto max-w-5xl px-4 pt-14 pb-8 sm:px-6">
        <SectionHeading
          eyebrow="Players"
          title="Players & Teams"
          description="Every pair entered in the tournament. For everyone's privacy, only names and public stats are shown here — no contact details."
        />
      </section>

      <section aria-label="Teams directory" className="relative z-10 mx-auto max-w-5xl px-4 sm:px-6">
        {directory.length === 0 ? (
          <EmptyState
            icon={<HollyIcon size={30} />}
            title="No teams registered yet"
            description="Check back once registration opens and pairs start signing up."
          />
        ) : (
          <div className="flex flex-col gap-8">
            {[...byDivision.entries()].map(([division, entries]) => (
              <section key={division}>
                <h3 className="mb-3 text-xl font-extrabold text-[var(--color-plum)]">
                  {entries[0].team.division === division ? divisionTitle(division) : division}
                </h3>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {entries
                    .slice()
                    .sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999))
                    .map((entry) => (
                      <Card key={entry.team.id} variant="frosted">
                        <CardBody className="flex flex-col gap-2">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="font-extrabold text-[var(--color-plum)]">{entry.team.name}</p>
                            {entry.team.seed && (
                              <Badge status="info">Seed #{entry.team.seed}</Badge>
                            )}
                          </div>
                          <p className="text-sm text-[var(--color-ink-soft)]">
                            {entry.team.players.map((p) => p.name).join(' & ')}
                          </p>
                          <div className="flex flex-wrap items-center gap-3 border-t border-black/5 pt-2 text-xs text-[var(--color-ink-muted)]">
                            {entry.rank != null && <span>Rank #{entry.rank}</span>}
                            <span>{entry.played} played</span>
                            <span className="text-[var(--color-success)]">{entry.wins}W</span>
                            <span className="text-[var(--color-danger)]">{entry.losses}L</span>
                          </div>
                        </CardBody>
                      </Card>
                    ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </section>
    </main>
  )
}

function divisionTitle(slug: string): string {
  if (slug === 'mens_doubles') return "Men's Doubles"
  if (slug === 'womens_doubles') return "Women's Doubles"
  return slug
}
