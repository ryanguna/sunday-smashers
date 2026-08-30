'use client'

import { useState, useSyncExternalStore, useTransition } from 'react'
import Link from 'next/link'

import { Badge, Button, EmptyState } from '@/components/ui'
import { disputeSheet, verifySheet, type ScoresheetActionResult } from '@/app/scoresheets/actions'
import {
  applyScoresheetCommand,
  bothPairsSigned,
  formatWaiting,
  groupInbox,
  inboxCounts,
  inboxHeadline,
  scoresheetStatusView,
  waitingSince,
  type InboxItem,
  type ScoresheetCommand,
} from '@/lib/scoresheet'
import { cn } from '@/lib/cn'
import { DisputeDialog } from './DisputeDialog'
import { overlayFor, readOverlays, serverOverlays, subscribeOverlays, writeOverlay } from './localSheets'

export interface TabulatorInboxProps {
  items: readonly InboxItem[]
  now: number
  demo: boolean
  isTabulator: boolean
  viewerName: string
}

type Notice = { tone: 'ok' | 'danger'; text: string } | null

/**
 * The tabulator's desk.
 *
 * On the day this is the bottleneck role: one person deciding whether a signed
 * result may count. So the queue is ordered by what is blocking the tournament
 * rather than by court or time — disputes first, because a disputed sheet
 * stops a result dead, then sheets signed and waiting, then the ones still out
 * on court that need chasing.
 */
export function TabulatorInbox({ items, now, demo, isTabulator, viewerName }: TabulatorInboxProps) {
  const rawOverlay = useSyncExternalStore(subscribeOverlays, readOverlays, serverOverlays)
  const [notice, setNotice] = useState<Notice>(null)
  const [disputing, setDisputing] = useState<InboxItem | null>(null)
  const [pending, startTransition] = useTransition()

  const resolved: InboxItem[] = items.map((item) =>
    demo ? { ...item, sheet: overlayFor(rawOverlay, item.sheet) } : item,
  )
  const counts = inboxCounts(resolved)
  const groups = groupInbox(resolved)

  function run(
    item: InboxItem,
    build: (at: number) => ScoresheetCommand,
    server: () => Promise<ScoresheetActionResult>,
  ) {
    const at = demo ? now : Date.now()
    const result = applyScoresheetCommand(item.sheet, build(at), { matchComplete: true })
    if (!result.ok) {
      setNotice({ tone: 'danger', text: result.message })
      return
    }
    if (demo) {
      writeOverlay(result.state)
      setNotice({ tone: 'ok', text: `${item.teamAName} v ${item.teamBName}: ${result.message}` })
      return
    }
    setNotice({ tone: 'ok', text: `${item.teamAName} v ${item.teamBName}: ${result.message}` })
    startTransition(async () => {
      const response = await server()
      if (!response.ok) setNotice({ tone: 'danger', text: response.message })
    })
  }

  const handleVerify = (item: InboxItem) =>
    run(
      item,
      (at) => ({ kind: 'verify', actor: viewerName, actorId: null, at }),
      () => verifySheet(item.matchId),
    )

  const handleDispute = (reason: string) => {
    const item = disputing
    setDisputing(null)
    if (!item) return
    run(
      item,
      (at) => ({ kind: 'dispute', reason, actor: viewerName, actorId: null, at }),
      () => disputeSheet(item.matchId, reason),
    )
  }

  const summary: { key: string; label: string; value: number; tone: string }[] = [
    { key: 'toVerify', label: 'To verify', value: counts.toVerify, tone: 'var(--color-brand-pink-dark)' },
    { key: 'disputed', label: 'Disputed', value: counts.disputed, tone: 'var(--color-danger)' },
    {
      key: 'awaiting',
      label: 'Out for signature',
      value: counts.awaitingSignature,
      tone: 'var(--color-warn)',
    },
    { key: 'verified', label: 'Verified', value: counts.verified, tone: 'var(--color-brand-mint-dark)' },
  ]

  return (
    <div className="flex flex-col gap-6">
      <section
        className="rounded-[var(--radius-lg)] border-2 border-[var(--color-brand-lilac-light)] bg-white p-4 sm:p-5"
        aria-labelledby="inbox-summary-heading"
      >
        <h2
          id="inbox-summary-heading"
          className="font-[family-name:var(--font-heading)] text-xl font-extrabold"
          style={{ color: 'var(--color-plum)' }}
        >
          {inboxHeadline(counts)}
        </h2>
        <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
          {counts.outstanding} of {counts.total} sheets are not yet counting towards the standings.
        </p>
        <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {summary.map((stat) => (
            <div
              key={stat.key}
              className="rounded-[var(--radius-md)] bg-[var(--color-frost-100)] px-3 py-2 text-center"
            >
              <dt className="text-xs font-bold uppercase tracking-wide text-[var(--color-ink-muted)]">
                {stat.label}
              </dt>
              <dd
                className="font-[family-name:var(--font-heading)] text-3xl font-extrabold tabular-nums"
                style={{ color: stat.tone }}
              >
                {stat.value}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <div
        role="status"
        aria-live="polite"
        className={
          notice
            ? cn(
                'rounded-[var(--radius-md)] border-2 px-3 py-2 text-sm text-[var(--color-ink)]',
                notice.tone === 'danger'
                  ? 'border-[var(--color-danger)] bg-[var(--color-danger-bg)]'
                  : 'border-[var(--color-brand-mint-dark)] bg-[var(--color-success-bg)]',
              )
            : 'sr-only'
        }
      >
        {notice ? notice.text : ''}
      </div>

      <InboxSection
        id="disputed"
        title="Disputed — sort these out first"
        blurb="A pair disagrees with the sheet. Nothing counts until it is corrected and re-signed."
        items={groups.disputed}
        now={now}
        emptyText="No disputes. Merry Christmas."
        pending={pending}
        isTabulator={isTabulator}
        onVerify={handleVerify}
        onDispute={setDisputing}
      />

      <InboxSection
        id="to-verify"
        title="Signed and waiting for you"
        blurb="Both pairs have agreed. Check the sheet, then verify it so the result counts."
        items={groups.toVerify}
        now={now}
        emptyText="Nothing waiting to be verified right now."
        pending={pending}
        isTabulator={isTabulator}
        onVerify={handleVerify}
        onDispute={setDisputing}
      />

      <InboxSection
        id="awaiting-signature"
        title="Still out on court"
        blurb="The result is recorded but a pair has not signed yet. Worth a chase."
        items={groups.awaitingSignature}
        now={now}
        emptyText="Every finished match has been signed."
        pending={pending}
        isTabulator={isTabulator}
        onVerify={handleVerify}
        onDispute={setDisputing}
      />

      {groups.notStarted.length > 0 ? (
        <InboxSection
          id="not-started"
          title="No sheet opened yet"
          blurb="These matches have a result but nobody has opened a sheet for them."
          items={groups.notStarted}
          now={now}
          emptyText=""
          pending={pending}
          isTabulator={isTabulator}
          onVerify={handleVerify}
          onDispute={setDisputing}
        />
      ) : null}

      <InboxSection
        id="verified"
        title="Verified today"
        blurb="Done and counting. Kept here so the day's paperwork can be checked at the end."
        items={groups.verified}
        now={now}
        emptyText="Nothing verified yet."
        maxVisible={8}
        pending={pending}
        isTabulator={isTabulator}
        onVerify={handleVerify}
        onDispute={setDisputing}
      />

      <DisputeDialog
        open={disputing != null}
        onClose={() => setDisputing(null)}
        matchLabel={disputing ? `${disputing.teamAName} v ${disputing.teamBName}` : ''}
        busy={pending}
        onSubmit={handleDispute}
      />
    </div>
  )
}

interface InboxSectionProps {
  id: string
  title: string
  blurb: string
  items: readonly InboxItem[]
  now: number
  emptyText: string
  /** Long, finished piles are trimmed — the desk is about what is left to do. */
  maxVisible?: number
  pending: boolean
  isTabulator: boolean
  onVerify: (item: InboxItem) => void
  onDispute: (item: InboxItem) => void
}

function InboxSection({
  id,
  title,
  blurb,
  items,
  now,
  emptyText,
  maxVisible,
  pending,
  isTabulator,
  onVerify,
  onDispute,
}: InboxSectionProps) {
  const shown = maxVisible ? items.slice(0, maxVisible) : items
  const hidden = items.length - shown.length

  return (
    <section aria-labelledby={`${id}-heading`} className="flex flex-col gap-2">
      <div>
        <h2
          id={`${id}-heading`}
          className="font-[family-name:var(--font-heading)] text-xl font-extrabold"
          style={{ color: 'var(--color-plum)' }}
        >
          {title}{' '}
          <span className="text-base font-bold text-[var(--color-ink-muted)]">({items.length})</span>
        </h2>
        <p className="text-sm text-[var(--color-ink-soft)]">{blurb}</p>
      </div>

      {items.length === 0 ? (
        emptyText ? (
          <EmptyState title={emptyText} />
        ) : null
      ) : (
        <ul className="flex flex-col gap-2">
          {shown.map((item) => (
            <InboxRow
              key={item.matchId}
              item={item}
              now={now}
              pending={pending}
              isTabulator={isTabulator}
              onVerify={onVerify}
              onDispute={onDispute}
            />
          ))}
        </ul>
      )}

      {hidden > 0 ? (
        <p className="text-sm text-[var(--color-ink-muted)]">
          {hidden} more already verified —{' '}
          <Link
            href="/scoresheets"
            className="font-semibold underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-pink-dark)]"
            style={{ color: 'var(--color-plum)' }}
          >
            browse every scoresheet
          </Link>
          .
        </p>
      ) : null}
    </section>
  )
}

interface InboxRowProps {
  item: InboxItem
  now: number
  pending: boolean
  isTabulator: boolean
  onVerify: (item: InboxItem) => void
  onDispute: (item: InboxItem) => void
}

function InboxRow({ item, now, pending, isTabulator, onVerify, onDispute }: InboxRowProps) {
  const view = scoresheetStatusView(item.sheet.status)
  const href = `/scoresheets/${encodeURIComponent(item.matchId)}`
  const signed = item.sheet.signatures.map((s) => s.playerName)

  return (
    <li className="rounded-[var(--radius-lg)] border-2 border-[var(--color-brand-lilac-light)] bg-white p-3 sm:p-4">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h3 className="font-[family-name:var(--font-heading)] text-base font-extrabold">
            <Link
              href={href}
              className="rounded-[var(--radius-sm)] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-pink-dark)]"
              style={{ color: 'var(--color-plum)' }}
            >
              {item.teamAName} <span className="text-[var(--color-ink-muted)]">v</span>{' '}
              {item.teamBName}
            </Link>
          </h3>
          <p className="text-sm text-[var(--color-ink-soft)]">
            {item.divisionName} · {item.stageLabel} · {item.court} · {item.slotLabel}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span
            className="font-[family-name:var(--font-heading)] text-2xl font-extrabold tabular-nums"
            style={{ color: 'var(--color-plum)' }}
          >
            {item.scoreLine}
          </span>
          <Badge status={view.badge}>{view.label}</Badge>
        </div>
      </div>

      <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
        {item.endingKind ? `${item.outcomeLabel} · ` : ''}
        {formatWaiting(waitingSince(item.sheet, item.resultAt), now)} ·{' '}
        {signed.length === 0
          ? 'no signatures yet'
          : `signed by ${signed.join(' and ')}${bothPairsSigned(item.sheet) ? '' : ' — one pair still to sign'}`}
      </p>

      {item.sheet.disputeReason ? (
        <p className="mt-2 rounded-[var(--radius-md)] border-2 border-[var(--color-danger)] bg-[var(--color-danger-bg)] px-3 py-2 text-sm text-[var(--color-ink)]">
          <span className="font-semibold">Dispute:</span> {item.sheet.disputeReason}
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        {item.sheet.status === 'submitted' && isTabulator ? (
          <Button
            variant="festive"
            size="sm"
            type="button"
            onClick={() => onVerify(item)}
            loading={pending}
            disabled={pending}
          >
            Verify
          </Button>
        ) : null}
        {item.sheet.status !== 'draft' && item.sheet.status !== 'disputed' && isTabulator ? (
          <Button
            variant="danger"
            size="sm"
            type="button"
            onClick={() => onDispute(item)}
            disabled={pending}
          >
            Send back as disputed
          </Button>
        ) : null}
        <Button variant="secondary" size="sm" href={href}>
          Open the sheet
        </Button>
      </div>
    </li>
  )
}
