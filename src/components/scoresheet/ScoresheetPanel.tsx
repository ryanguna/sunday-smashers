'use client'

import { useState, useSyncExternalStore, useTransition } from 'react'

import { Badge, Button } from '@/components/ui'
import {
  disputeSheet,
  openSheet,
  reopenSheet,
  signSheet,
  submitSheet,
  verifySheet,
  withdrawSignature,
  type ScoresheetActionResult,
} from '@/app/scoresheets/actions'
import {
  applyScoresheetCommand,
  bothPairsSigned,
  chainOfCustody,
  formatAge,
  missingSignatureSides,
  scoresheetStatusView,
  signatureSlots,
  type ScoresheetCommand,
  type SheetState,
} from '@/lib/scoresheet'
import { sideName, type MatchScoringConfig, type ScoringPlayer, type ScoringSide } from '@/lib/scoring'
import { ChainOfCustody } from './ChainOfCustody'
import { DisputeDialog } from './DisputeDialog'
import { SignatureCard } from './SignatureCard'
import { overlayFor, readOverlays, serverOverlays, subscribeOverlays, writeOverlay } from './localSheets'

export interface ScoresheetPanelProps {
  matchId: string
  matchLabel: string
  config: MatchScoringConfig
  sheet: SheetState
  scoreA: number
  scoreB: number
  winnerName: string
  matchComplete: boolean
  demo: boolean
  now: number
  /** True when the viewer may verify — tabulator or admin. */
  isTabulator: boolean
  viewerName: string
}

type Notice = { tone: 'ok' | 'warn' | 'danger'; text: string } | null

/**
 * The interactive half of a scoresheet: the chain-of-custody rail, both
 * signature slots, and the submit / verify / dispute controls.
 *
 * Every change goes through `applyScoresheetCommand` locally first, so an
 * illegal move is refused with a sentence instead of a spinner, and the same
 * machine then runs again on the server where it is authoritative. In demo
 * mode there is no server, so the advanced sheet is stored in `localStorage`
 * and `/tabulator` picks it up — the whole chain is walkable with no database.
 */
export function ScoresheetPanel({
  matchId,
  matchLabel,
  config,
  sheet: serverSheet,
  scoreA,
  scoreB,
  winnerName,
  matchComplete,
  demo,
  now,
  isTabulator,
  viewerName,
}: ScoresheetPanelProps) {
  const rawOverlay = useSyncExternalStore(subscribeOverlays, readOverlays, serverOverlays)
  const [liveSheet, setLiveSheet] = useState<SheetState | null>(null)
  const [notice, setNotice] = useState<Notice>(null)
  const [disputeOpen, setDisputeOpen] = useState(false)
  const [pending, startTransition] = useTransition()

  const sheet = demo ? overlayFor(rawOverlay, serverSheet) : (liveSheet ?? serverSheet)
  const view = scoresheetStatusView(sheet.status)
  const slots = signatureSlots(config, sheet)
  const openForSignature = sheet.status === 'awaiting_signature'
  const missing = missingSignatureSides(sheet)
  const steps = chainOfCustody(sheet, matchComplete)

  const agreement = `We agree that this match finished ${scoreA}–${scoreB}${
    winnerName ? ` to ${winnerName}` : ''
  }, as recorded on this sheet.`

  function run(build: (at: number) => ScoresheetCommand, server: () => Promise<ScoresheetActionResult>) {
    // The only place a clock is read: an event handler, never a render.
    const at = demo ? now : Date.now()
    const command = build(at)
    const result = applyScoresheetCommand(sheet, command, { matchComplete })
    if (!result.ok) {
      setNotice({ tone: 'danger', text: result.message })
      return
    }

    if (demo) {
      writeOverlay(result.state)
      setNotice({
        tone: 'ok',
        text: `${result.message} Demo mode — kept on this device, and visible on the tabulator inbox.`,
      })
      return
    }

    setLiveSheet(result.state)
    setNotice({ tone: 'ok', text: result.message })
    startTransition(async () => {
      const response = await server()
      if (!response.ok) {
        setLiveSheet(null)
        setNotice({ tone: 'danger', text: response.message })
      }
    })
  }

  const handleSign = (side: ScoringSide, player: ScoringPlayer) =>
    run(
      (at) => ({ kind: 'sign', side, playerId: player.id, playerName: player.name, at }),
      () => signSheet({ matchId, side, playerId: player.id, playerName: player.name }),
    )

  const handleWithdraw = (side: ScoringSide) =>
    run(
      (at) => ({ kind: 'withdraw_signature', side, actor: viewerName, at }),
      () => withdrawSignature(matchId, side),
    )

  const handleOpen = () =>
    run(
      (at) => ({ kind: 'open', actor: viewerName, at }),
      () => openSheet(matchId),
    )

  const handleSubmit = () =>
    run(
      (at) => ({ kind: 'submit', actor: viewerName, actorId: null, at }),
      () => submitSheet(matchId),
    )

  const handleVerify = () =>
    run(
      (at) => ({ kind: 'verify', actor: viewerName, actorId: null, at }),
      () => verifySheet(matchId),
    )

  const handleReopen = () =>
    run(
      (at) => ({ kind: 'reopen', actor: viewerName, at }),
      () => reopenSheet(matchId),
    )

  const handleDispute = (reason: string) => {
    setDisputeOpen(false)
    run(
      (at) => ({ kind: 'dispute', reason, actor: viewerName, actorId: null, at }),
      () => disputeSheet(matchId, reason),
    )
  }

  return (
    <section className="flex flex-col gap-5" aria-labelledby="sheet-status-heading">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2
            id="sheet-status-heading"
            className="font-[family-name:var(--font-heading)] text-xl font-extrabold"
            style={{ color: 'var(--color-plum)' }}
          >
            Chain of custody
          </h2>
          <Badge status={view.badge}>{view.label}</Badge>
        </div>
        <p className="text-sm text-[var(--color-ink-soft)]">{view.blurb}</p>
      </div>

      <ChainOfCustody steps={steps} />

      {sheet.status === 'disputed' && sheet.disputeReason ? (
        <div className="rounded-[var(--radius-lg)] border-2 border-[var(--color-danger)] bg-[var(--color-danger-bg)] p-4">
          <h3
            className="font-[family-name:var(--font-heading)] text-base font-extrabold"
            style={{ color: 'var(--color-plum)' }}
          >
            Dispute raised{sheet.disputedBy ? ` by ${sheet.disputedBy}` : ''}
          </h3>
          <p className="mt-1 text-sm text-[var(--color-ink)]">{sheet.disputeReason}</p>
          <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
            Correct the record on the scoring console first, then reopen this sheet so both pairs
            can sign the corrected result.
          </p>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        {slots.map((slot) => (
          <SignatureCard
            key={slot.side}
            slot={slot}
            agreement={agreement}
            open={openForSignature}
            lockedNote={
              sheet.status === 'draft'
                ? 'The umpire has not finished this match yet.'
                : sheet.status === 'disputed'
                  ? 'Signatures were cleared when this sheet was disputed.'
                  : 'This sheet has been submitted, so signatures are locked.'
            }
            busy={pending}
            now={now}
            onSign={handleSign}
            onWithdraw={handleWithdraw}
          />
        ))}
      </div>

      <div
        role="status"
        aria-live="polite"
        className={
          notice
            ? `rounded-[var(--radius-md)] border-2 px-3 py-2 text-sm ${
                notice.tone === 'danger'
                  ? 'border-[var(--color-danger)] bg-[var(--color-danger-bg)] text-[var(--color-ink)]'
                  : notice.tone === 'warn'
                    ? 'border-[var(--color-warn)] bg-[var(--color-warn-bg)] text-[var(--color-ink)]'
                    : 'border-[var(--color-brand-mint-dark)] bg-[var(--color-success-bg)] text-[var(--color-ink)]'
              }`
            : 'sr-only'
        }
      >
        {notice ? notice.text : ''}
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-2">
          {sheet.status === 'draft' ? (
            <Button
              variant="primary"
              type="button"
              onClick={handleOpen}
              disabled={pending || !matchComplete}
            >
              Open for signatures
            </Button>
          ) : null}

          {openForSignature ? (
            <Button
              variant="primary"
              type="button"
              onClick={handleSubmit}
              loading={pending}
              disabled={pending || !bothPairsSigned(sheet)}
            >
              Send to the tabulator
            </Button>
          ) : null}

          {sheet.status === 'submitted' && isTabulator ? (
            <Button variant="festive" type="button" onClick={handleVerify} loading={pending} disabled={pending}>
              Verify this sheet
            </Button>
          ) : null}

          {sheet.status === 'disputed' ? (
            <Button variant="primary" type="button" onClick={handleReopen} disabled={pending}>
              Reopen for signatures
            </Button>
          ) : null}

          {sheet.status !== 'draft' && sheet.status !== 'disputed' ? (
            <Button variant="danger" type="button" onClick={() => setDisputeOpen(true)} disabled={pending}>
              {sheet.status === 'verified' ? 'Something is wrong — dispute it' : 'We do not agree'}
            </Button>
          ) : null}

          <Button variant="secondary" href={`/scoresheets/${encodeURIComponent(matchId)}/print`}>
            Printable sheet
          </Button>
        </div>

        {openForSignature && missing.length > 0 ? (
          <p className="text-sm text-[var(--color-ink-soft)]">
            Waiting on {missing.map((side) => sideName(config, side)).join(' and ')} before this can
            go to the tabulator.
          </p>
        ) : null}

        {sheet.status === 'submitted' && !isTabulator ? (
          <p className="text-sm text-[var(--color-ink-soft)]">
            Both pairs have signed. Only the tabulator can verify it from here.
          </p>
        ) : null}

        {sheet.status === 'verified' ? (
          <p className="text-sm text-[var(--color-ink-soft)]">
            Verified{sheet.verifiedBy ? ` by ${sheet.verifiedBy}` : ''},{' '}
            {formatAge(sheet.verifiedAt, now)}. This result counts towards the standings.
          </p>
        ) : null}
      </div>

      <DisputeDialog
        open={disputeOpen}
        onClose={() => setDisputeOpen(false)}
        matchLabel={matchLabel}
        busy={pending}
        onSubmit={handleDispute}
      />
    </section>
  )
}
