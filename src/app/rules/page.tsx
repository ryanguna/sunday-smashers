import type { Metadata } from 'next'
import { Badge, Card, CardBody, SectionHeading, Snowfall } from '@/components/ui'
import { Markdown } from '@/components/Markdown'
import { loadSiteContent } from '@/lib/site-content'
import { PageGate } from '@/components/PageGate'
import { loadPublicTournamentConfig } from '@/lib/tournament-config'
import { loadSiteCopy } from '@/lib/site-copy-server'
import { formatTournamentDateLabel } from '@/lib/tournament'
import { defaultRulesMarkdown } from '@/lib/tournament-copy'

export const metadata: Metadata = {
  title: 'Rules & Info',
  description:
    'Draft rules for the Sunday Smashers Christmas Mini Tournament — eliminations, semis & finals, officiating, scoresheets and forfeits.',
}

export default async function RulesPage() {
  const [rulesRow, { dates, divisions }, copy] = await Promise.all([
    loadSiteContent('draft-rules-v1'),
    loadPublicTournamentConfig(),
    loadSiteCopy(),
  ])

  // Built from the published divisions rather than quoted, so the page can
  // never promise a scoring target the engine is not using.
  const rulesMarkdown =
    rulesRow?.body_markdown ?? defaultRulesMarkdown(divisions, copy.forfeitGraceMinutes)

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
