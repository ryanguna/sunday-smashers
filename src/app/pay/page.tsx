import type { Metadata } from 'next'

import { Card, GradientText, SectionHeading } from '@/components/ui'
import { formatEntryFee } from '@/lib/setup'
import { loadPublicTournamentConfig } from '@/lib/tournament-config'
import { PageGate } from '@/components/PageGate'

export const metadata: Metadata = {
  title: 'Paying your entry fee',
  description: 'How to pay your Sunday Smashers Christmas Mini Tournament entry fee.',
}

/**
 * `/pay` — where "How to pay" actually goes.
 *
 * The player dashboard has always nudged unpaid players with a "How to pay"
 * button, but it pointed at `/register`, which says nothing about money: a
 * player told to pay was sent to a page that could not tell them the amount,
 * the method, or who to give it to. The fee, the instructions and the
 * organiser's contact details all live on the tournament row (migration
 * 0010), so this page reads them back — and says plainly when the committee
 * has not filled one in yet, rather than inventing a figure.
 */
export default async function PayPage() {
  const config = await loadPublicTournamentConfig()
  const fee = config.entryFeeCents === null ? null : formatEntryFee(config.entryFeeCents)
  const hasContact = Boolean(config.contactName || config.contactPhone || config.contactEmail)

  return (
    <PageGate pageKey="pay">
      <main className="mx-auto max-w-3xl px-4 py-10 sm:py-16">
        <SectionHeading
          level={1}
          eyebrow="Entry fee"
          title={<GradientText as="span">Paying your entry</GradientText>}
          description="Entries are confirmed once the committee has your fee — unpaid spots can be released."
        />

        <div className="mt-8 space-y-5">
          <Card className="p-6">
            <h2 className="text-lg font-semibold text-[var(--color-ink)]">What you owe</h2>
            {/* Ink, not brand pink: the pastels are decorative and only reach
                2.09:1 on white, well under the 3:1 AA needs for large text. */}
            <p className="mt-2 text-3xl font-black text-[var(--color-plum)]">{fee ?? 'To be confirmed'}</p>
            <p className="mt-2 text-sm text-[var(--color-ink-soft)]">
              {fee
                ? 'Per player, covering your matches, a loot bag and the prize pool.'
                : 'The committee hasn’t set the entry fee yet. Check back shortly, or ask an organiser below.'}
            </p>
          </Card>

          <Card className="p-6">
            <h2 className="text-lg font-semibold text-[var(--color-ink)]">How to pay</h2>
            {config.paymentInstructions ? (
              <p className="mt-2 whitespace-pre-line text-[var(--color-ink-soft)]">
                {config.paymentInstructions}
              </p>
            ) : (
              <p className="mt-2 text-[var(--color-ink-soft)]">
                The committee hasn&rsquo;t published payment instructions yet. Please get in touch using the
                details below and they&rsquo;ll sort you out.
              </p>
            )}
          </Card>

          <Card className="p-6">
            <h2 className="text-lg font-semibold text-[var(--color-ink)]">Who to ask</h2>
            {hasContact ? (
              <ul className="mt-2 space-y-1 text-[var(--color-ink-soft)]">
                {config.contactName && <li>{config.contactName}</li>}
                {config.contactPhone && (
                  <li>
                    <a className="underline" href={`tel:${config.contactPhone}`}>
                      {config.contactPhone}
                    </a>
                  </li>
                )}
                {config.contactEmail && (
                  <li>
                    <a className="underline" href={`mailto:${config.contactEmail}`}>
                      {config.contactEmail}
                    </a>
                  </li>
                )}
              </ul>
            ) : (
              <p className="mt-2 text-[var(--color-ink-soft)]">
                Ask any Sunday Smashers committee member at the hall.
              </p>
            )}
          </Card>

          <p className="text-sm text-[var(--color-ink-soft)]">
            Once the committee records your payment your dashboard will show{' '}
            <span className="font-semibold text-[var(--color-ink)]">Paid</span>. After a bank transfer that
            can take a day or two.
          </p>
        </div>
      </main>
    </PageGate>
  )
}
