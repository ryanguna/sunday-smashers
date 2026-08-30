import type { Metadata } from 'next'
import { EmptyState, SectionHeading, Snowfall } from '@/components/ui'
import { HollyIcon } from '@/components/icons'
import { DemoNotice, PairCard } from '@/components/players'
import { getPlayersDirectory } from '@/lib/public-data'
import { getPlayerDirectory } from '@/lib/player-profile'
import { isSupabaseConfigured } from '@/lib/supabase/config'

export const metadata: Metadata = {
  title: 'Players & Teams',
  description:
    'The public players and teams directory for the Sunday Smashers Christmas Mini Tournament — pairs, divisions and standings so far.',
}

export const dynamic = 'force-dynamic'

export default async function PlayersPage() {
  const [directory, players] = await Promise.all([getPlayersDirectory(), getPlayerDirectory()])
  const handleByPlayerId = new Map(players.map((p) => [p.playerId, p.handle]))

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
          description="Every pair entered in the tournament. Tap any name for their profile, stats and fixtures. For everyone's privacy, only names and public stats are shown here — no contact details."
        />
        {!isSupabaseConfigured() && (
          <div className="mt-4 flex justify-center">
            <DemoNotice />
          </div>
        )}
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
                      <PairCard
                        key={entry.team.id}
                        entry={entry}
                        handleByPlayerId={handleByPlayerId}
                      />
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
