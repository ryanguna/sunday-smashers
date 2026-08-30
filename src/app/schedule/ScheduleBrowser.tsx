'use client'

import { useMemo, useState } from 'react'
import { Badge, Card, CardBody, EmptyState } from '@/components/ui'
import { RacketIcon } from '@/components/icons'
import { MatchCard } from '@/components/results'
import {
  filterMatchesByDivision,
  groupMatchesByCourt,
  matchesForPlayerQuery,
  type PublicDivisionInfo,
  type PublicMatch,
} from '@/lib/public-data'
import { cn } from '@/lib/cn'

interface ScheduleBrowserProps {
  matches: PublicMatch[]
  divisions: PublicDivisionInfo[]
}

export function ScheduleBrowser({ matches, divisions }: ScheduleBrowserProps) {
  const [division, setDivision] = useState<string | null>(null)
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => filterMatchesByDivision(matches, division), [matches, division])
  const searchResults = useMemo(() => matchesForPlayerQuery(filtered, query), [filtered, query])
  const groups = useMemo(() => groupMatchesByCourt(filtered), [filtered])

  return (
    <div className="flex flex-col gap-6">
      <Card variant="frosted">
        <CardBody className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by division">
            <button
              type="button"
              onClick={() => setDivision(null)}
              className={cn(
                'rounded-[var(--radius-pill)] px-4 py-1.5 text-sm font-semibold transition-colors',
                division === null
                  ? 'bg-[image:var(--gradient-candy)] text-white shadow-[var(--shadow-glow-pink)]'
                  : 'bg-white text-[var(--color-ink-muted)] hover:bg-[var(--color-brand-lilac-light)]/50'
              )}
            >
              All divisions
            </button>
            {divisions.map((d) => (
              <button
                key={d.slug}
                type="button"
                onClick={() => setDivision(d.slug)}
                className={cn(
                  'rounded-[var(--radius-pill)] px-4 py-1.5 text-sm font-semibold transition-colors',
                  division === d.slug
                    ? 'bg-[image:var(--gradient-candy)] text-white shadow-[var(--shadow-glow-pink)]'
                    : 'bg-white text-[var(--color-ink-muted)] hover:bg-[var(--color-brand-lilac-light)]/50'
                )}
              >
                {d.name}
              </button>
            ))}
          </div>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold text-[var(--color-plum)]">
              🎁 Find my next match
            </span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search a pair or player name…"
              className="w-full rounded-[var(--radius-md)] border border-black/10 bg-white px-3 py-2 text-sm shadow-inner focus:border-[var(--color-brand-pink)] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-pink-light)]"
            />
          </label>
        </CardBody>
      </Card>

      {query.trim() && (
        <section aria-label="Search results">
          {searchResults.length === 0 ? (
            <p className="text-center text-sm text-[var(--color-ink-soft)]">
              No matches found for &ldquo;{query}&rdquo;.
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {searchResults.map((m) => (
                <MatchCard key={m.id} match={m} />
              ))}
            </div>
          )}
        </section>
      )}

      {groups.length === 0 ? (
        <EmptyState
          icon={<RacketIcon size={30} />}
          title="No matches scheduled yet"
          description="The timetable will appear here once the draw is published."
        />
      ) : (
        <div className="flex flex-col gap-8">
          {groups.map((group) => (
            <section key={group.court} aria-labelledby={`court-${group.court}`}>
              <div className="mb-3 flex items-center gap-2">
                <RacketIcon size={20} className="text-[var(--color-brand-lilac-dark)]" />
                <h3 id={`court-${group.court}`} className="text-xl font-extrabold text-[var(--color-plum)]">
                  {group.court}
                </h3>
                <Badge status="info">{group.matches.length} matches</Badge>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {group.matches.map((m) => (
                  <MatchCard key={m.id} match={m} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
