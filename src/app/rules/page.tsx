import type { Metadata } from 'next'
import { Badge, Card, CardBody, SectionHeading, Snowfall } from '@/components/ui'
import { Markdown } from '@/components/Markdown'
import { loadSiteContent } from '@/lib/site-content'
import { PageGate } from '@/components/PageGate'
import { loadPublicTournamentConfig } from '@/lib/tournament-config'
import { loadSiteCopy } from '@/lib/site-copy-server'
import { formatTournamentDateLabel } from '@/lib/tournament'

export const metadata: Metadata = {
  title: 'Rules & Info',
  description:
    'Draft rules for the Sunday Smashers Christmas Mini Tournament — eliminations, semis & finals, officiating, scoresheets and forfeits.',
}

/**
 * Hard-coded fallback content for demo mode (no Supabase env vars) or if
 * Supabase is configured but the `site_content` rows haven't been seeded
 * yet. Same substance as `supabase/seed.sql`'s `draft-rules-v1` row,
 * reorganised under explicit headings (Eliminations / Semis & Finals
 * / Officiating & Scoresheets / Forfeits) for scannability.
 */
const FALLBACK_RULES_MARKDOWN = `
## Eliminations

- Single round robin — every pair plays every other pair in their pool exactly once.
- Games are played first to **15 points, no deuce**.
- Ranking is by number of **wins**; ties are broken by **head-to-head** result (or a mini league / point difference / points scored for 3+ way ties).

## Semis & Finals

- **Semi-finals**: the top 4 ranked pairs qualify. M1 = Rank 1 vs Rank 4, M2 = Rank 2 vs Rank 3. First to **21 points, no deuce**.
- **Battle for 3rd**: the losers of M1 and M2 play off for third place.
- **Championship**: the winners of M1 and M2 play for the title.

## Officiating & Scoresheets

- Scoresheets are provided **per court** and must be **signed by both pairs after every game**.
- The players in the **next match-up on that court** are rostered as:
- **Umpire / Scorer**
- **Scoresheet person**
- **2x Line persons**
- The umpire's and line judges' calls are **final**.
- The scoresheet person **submits the signed scoresheet to the Tabulator at the end of each game**.

## Forfeits

- A pair has **3 minutes** from their match being called to be on court and ready. This is a fixed limit — the umpire starts it when the call goes out.
- **Late arrival or a no-show forfeits that game automatically** once those 3 minutes are up.
`.trim()

export default async function RulesPage() {
  const [rulesRow, { dates }, copy] = await Promise.all([
    loadSiteContent('draft-rules-v1'),
    loadPublicTournamentConfig(),
    loadSiteCopy(),
  ])

  const rulesMarkdown = rulesRow?.body_markdown ?? FALLBACK_RULES_MARKDOWN

  return (
    <PageGate pageKey="rules">
      <main className="relative overflow-hidden">
        <Snowfall />

        <section className="relative z-10 mx-auto max-w-3xl px-4 pt-14 pb-6 sm:px-6">
          <SectionHeading
            eyebrow="Rules & Info"
            title="Tournament Rules"
            level={1}
            description="Everything you need to know about how the Sunday Smashers Christmas Mini Tournament is played and officiated."
          />

          {/* The banner used to be unconditional, which meant the rules were
              stamped "draft" forever — there was no way to ever mark them
              final. It now follows the committee's own switch in
              /admin/settings/copy. */}
          {copy.rulesAreFinal ? (
            <div
              role="note"
              aria-label="Rules status notice"
              className="mt-8 flex flex-wrap items-center gap-3 rounded-[var(--radius-lg)] border border-[var(--color-brand-mint)]/50 bg-[var(--color-brand-mint-light)]/40 p-4"
            >
              <Badge status="approved">Final</Badge>
              <p className="text-sm text-[var(--color-ink-soft)]">
                These are the confirmed rules for {formatTournamentDateLabel(dates.tournamentDate)}.
                Play them as written 🎄
              </p>
            </div>
          ) : (
            <div
              role="note"
              aria-label="Draft status notice"
              className="mt-8 flex flex-wrap items-center gap-3 rounded-[var(--radius-lg)] border-2 border-dashed border-[var(--color-brand-gold-dark)] bg-[var(--color-warn-bg)] p-4"
            >
              <Badge status="pending">Draft — not yet final</Badge>
              <p className="text-sm text-[var(--color-ink-soft)]">
                These rules are a working draft from the organising committee and may still change
                before tournament day. Check back closer to {formatTournamentDateLabel(dates.tournamentDate)}{' '}
                for the confirmed version.
              </p>
            </div>
          )}
        </section>

        <section aria-labelledby="format-heading" className="relative z-10 mx-auto max-w-3xl px-4 pb-10 sm:px-6">
          <h2 id="format-heading" className="sr-only">
            Eliminations, semis &amp; finals, officiating and forfeits
          </h2>
          <Card variant="frosted">
            <CardBody>
              <Markdown content={rulesMarkdown} />
            </CardBody>
          </Card>

          <Card variant="outline" className="mt-6">
            <CardBody>
              <h3 className="text-lg font-extrabold text-[var(--color-plum)]">
                🏸 A note on &ldquo;10 games&rdquo;
              </h3>
              <p className="mt-2 text-sm text-[var(--color-ink-soft)]">
                In a single round robin, every pair plays every other pair exactly once — so the
                number of round robin games each pair plays is always{' '}
                <em>(number of pairs in the pool) &minus; 1</em>. The &ldquo;10 games&rdquo; figure
                you may have seen quoted assumes a pool of <strong>11 pairs</strong>. If the final
                entry count is different, your number of round robin games will change to match —
                the format (round robin → top 4 → semis → championship) stays the same regardless of
                how many pairs register.
              </p>
            </CardBody>
          </Card>
        </section>

      </main>
    </PageGate>
  )
}
