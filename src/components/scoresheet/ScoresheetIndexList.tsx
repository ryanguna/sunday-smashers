'use client'

import { useMemo, useState, useSyncExternalStore } from 'react'
import Link from 'next/link'

import { Badge, Button, EmptyState } from '@/components/ui'
import {
  SCORESHEET_STATUS_ORDER,
  bothPairsSigned,
  formatWaiting,
  inboxCounts,
  scoresheetStatusView,
  waitingSince,
  type InboxItem,
} from '@/lib/scoresheet'
import type { ScoresheetStatus } from '@/lib/supabase/types'
import { cn } from '@/lib/cn'
import { overlayFor, readOverlays, serverOverlays, subscribeOverlays } from './localSheets'

export interface ScoresheetIndexListProps {
  items: readonly InboxItem[]
  now: number
  demo: boolean
}

type Filter = 'all' | ScoresheetStatus

/**
 * Every finished match's sheet, filterable by where it has got to.
 *
 * Players come here to find and sign their own match; the committee comes here
 * to see what is still outstanding. The filter defaults to everything so
 * neither has to guess which bucket their match is in.
 */
export function ScoresheetIndexList({ items, now, demo }: ScoresheetIndexListProps) {
  const rawOverlay = useSyncExternalStore(subscribeOverlays, readOverlays, serverOverlays)
  const [filter, setFilter] = useState<Filter>('all')

  const resolved = useMemo(
    () => items.map((item) => (demo ? { ...item, sheet: overlayFor(rawOverlay, item.sheet) } : item)),
    [items, demo, rawOverlay],
  )
  const counts = inboxCounts(resolved)

  const tabs: { key: Filter; label: string; count: number }[] = [
    { key: 'all', label: 'All sheets', count: counts.total },
    { key: 'awaiting_signature', label: 'Needs a signature', count: counts.awaitingSignature },
    { key: 'submitted', label: 'With the tabulator', count: counts.toVerify },
    { key: 'disputed', label: 'Disputed', count: counts.disputed },
    { key: 'verified', label: 'Verified', count: counts.verified },
  ]

  const shown = resolved
    .filter((item) => filter === 'all' || item.sheet.status === filter)
    .sort(
      (a, b) =>
        SCORESHEET_STATUS_ORDER.indexOf(a.sheet.status) -
          SCORESHEET_STATUS_ORDER.indexOf(b.sheet.status) ||
        a.slotIndex - b.slotIndex ||
        a.court.localeCompare(b.court),
    )

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter scoresheets by status">
        {tabs.map((tab) => {
          const active = filter === tab.key
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setFilter(tab.key)}
              aria-pressed={active}
              className={cn(
                'rounded-[var(--radius-pill)] border-2 px-3.5 py-1.5 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-pink-dark)]',
                active
                  ? 'border-[var(--color-plum)] bg-[var(--color-plum)] text-white'
                  : 'border-[var(--color-brand-lilac-light)] bg-white text-[var(--color-plum)] hover:bg-[var(--color-brand-lilac-light)]/40',
              )}
            >
              {tab.label}{' '}
              <span className="tabular-nums opacity-80">({tab.count})</span>
            </button>
          )
        })}
      </div>

      {shown.length === 0 ? (
        <EmptyState
          title="No sheets in this pile"
          description="Try another filter — or go and win a match so there is something to sign."
        />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {shown.map((item) => {
            const view = scoresheetStatusView(item.sheet.status)
            const href = `/scoresheets/${encodeURIComponent(item.matchId)}`
            return (
              <li
                key={item.matchId}
                className="flex flex-col gap-2 rounded-[var(--radius-lg)] border-2 border-[var(--color-brand-lilac-light)] bg-white p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
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
                  <Badge status={view.badge}>{view.label}</Badge>
                </div>

                <p className="text-sm text-[var(--color-ink-soft)]">
                  {item.divisionName} · {item.stageLabel} · {item.court} · {item.slotLabel}
                </p>

                <p className="flex flex-wrap items-baseline gap-2">
                  <span
                    className="font-[family-name:var(--font-heading)] text-2xl font-extrabold tabular-nums"
                    style={{ color: 'var(--color-plum)' }}
                  >
                    {item.scoreLine}
                  </span>
                  <span className="text-sm text-[var(--color-ink-soft)]">{item.outcomeLabel}</span>
                </p>

                <p className="text-sm text-[var(--color-ink-muted)]">
                  {item.sheet.signatures.length === 0
                    ? 'No signatures yet'
                    : bothPairsSigned(item.sheet)
                      ? 'Signed by both pairs'
                      : 'Signed by one pair'}{' '}
                  · {formatWaiting(waitingSince(item.sheet, item.resultAt), now)}
                </p>

                <div className="mt-auto flex flex-wrap gap-2 pt-1">
                  <Button variant="secondary" size="sm" href={href}>
                    Open the sheet
                  </Button>
                  <Button variant="ghost" size="sm" href={`${href}/print`}>
                    Print
                  </Button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
