import type { PublicDutyAssignment } from '@/lib/public-data'
import type { MatchScoringConfig, RallyHistoryRow, ScoreboardState } from '@/lib/scoring'
import { sideName } from '@/lib/scoring'
import {
  formatStamp,
  signatureSlots,
  scoresheetStatusView,
  type EndingPresentation,
  type RallySource,
  type SheetState,
} from '@/lib/scoresheet'
import { OfficialsPanel } from './OfficialsPanel'
import { RallyLog } from './RallyLog'
import { ScoreSummary } from './ScoreSummary'
import styles from './print.module.css'

export interface PrintableScoresheetProps {
  matchId: string
  divisionName: string
  stage: string
  court: string
  slotLabel: string
  config: MatchScoringConfig
  board: ScoreboardState
  rallies: readonly RallyHistoryRow[]
  rallySource: RallySource
  ending: EndingPresentation
  sheet: SheetState
  officials: readonly PublicDutyAssignment[]
  /** Wall clock for the printed footer, formatted on the server. */
  printedAtMs: number
  timeZone: string
}

/**
 * The paper copy.
 *
 * A Server Component with no interactivity, so it can be rendered straight to
 * a printer or a PDF. It carries the same facts as the screen — the rules the
 * match was played under, the rally log, how it ended, who officiated and who
 * signed — plus hand-signature lines, so the same sheet works when the wifi
 * does not.
 */
export function PrintableScoresheet({
  matchId,
  divisionName,
  stage,
  court,
  slotLabel,
  config,
  board,
  rallies,
  rallySource,
  ending,
  sheet,
  officials,
  printedAtMs,
  timeZone,
}: PrintableScoresheetProps) {
  const slots = signatureSlots(config, sheet)
  const view = scoresheetStatusView(sheet.status)

  return (
    <article className={`${styles.page} flex flex-col gap-4`}>
      <header className={`${styles.keepTogether} border-b-2 border-[var(--color-plum)] pb-3`}>
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-ink-muted)]">
          Sunday Smashers Christmas Mini Tournament
        </p>
        <h1
          className="font-[family-name:var(--font-heading)] text-2xl font-extrabold"
          style={{ color: 'var(--color-plum)' }}
        >
          Official scoresheet
        </h1>
        <p className="text-sm text-[var(--color-ink-soft)]">
          {divisionName} · {stage} · {court} · {slotLabel}
        </p>
        <p className="text-sm text-[var(--color-ink-soft)]">
          <span className="font-semibold">Status:</span> {view.label} · Match reference {matchId}
        </p>
      </header>

      <div className={styles.keepTogether}>
        <ScoreSummary board={board} config={config} ending={ending} print />
      </div>

      <div className={styles.keepTogether}>
        <OfficialsPanel officials={officials} print />
      </div>

      <section className={`${styles.signatureBlock} flex flex-col gap-2`} aria-labelledby="print-signatures">
        <h2
          id="print-signatures"
          className="font-[family-name:var(--font-heading)] text-lg font-extrabold"
          style={{ color: 'var(--color-plum)' }}
        >
          Agreement of both pairs
        </h2>
        <p className="text-sm text-[var(--color-ink-soft)]">
          By signing below, one representative of each pair agrees that the score above is the
          result of this match. If you do not agree, do not sign — write your reason in the query
          box and hand the sheet to the tabulator.
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          {slots.map((slot) => (
            <div
              key={slot.side}
              className="rounded-[var(--radius-md)] border border-[var(--color-plum)] p-3"
            >
              <p className="font-[family-name:var(--font-heading)] font-extrabold" style={{ color: 'var(--color-plum)' }}>
                {slot.teamName}
              </p>
              <p className="text-sm text-[var(--color-ink-soft)]">
                {slot.players.map((p) => p.name).join(' & ') || 'Pair to be confirmed'}
              </p>
              {slot.signature ? (
                <p className="mt-3 text-sm text-[var(--color-ink)]">
                  Signed digitally by{' '}
                  <span className="font-semibold">{slot.signature.playerName}</span>
                  <br />
                  {formatStamp(slot.signature.signedAt, timeZone)}
                </p>
              ) : (
                <>
                  <p className="mt-6 border-t border-[var(--color-ink-muted)] pt-1 text-xs text-[var(--color-ink-muted)]">
                    Signature
                  </p>
                  <p className="mt-4 border-t border-[var(--color-ink-muted)] pt-1 text-xs text-[var(--color-ink-muted)]">
                    Name (please print) · Time
                  </p>
                </>
              )}
            </div>
          ))}
        </div>

        <div className="rounded-[var(--radius-md)] border border-[var(--color-plum)] p-3">
          <p className="text-xs font-bold uppercase tracking-wide text-[var(--color-ink-muted)]">
            Query or dispute
          </p>
          {sheet.disputeReason ? (
            <p className="mt-1 text-sm text-[var(--color-ink)]">{sheet.disputeReason}</p>
          ) : (
            <>
              <p className="mt-5 border-t border-[var(--color-ink-muted)]" />
              <p className="mt-5 border-t border-[var(--color-ink-muted)]" />
            </>
          )}
        </div>

        <div className="rounded-[var(--radius-md)] border border-[var(--color-plum)] p-3">
          <p className="text-xs font-bold uppercase tracking-wide text-[var(--color-ink-muted)]">
            Tabulator verification
          </p>
          {sheet.status === 'verified' ? (
            <p className="mt-1 text-sm text-[var(--color-ink)]">
              Verified{sheet.verifiedBy ? ` by ${sheet.verifiedBy}` : ''} ·{' '}
              {formatStamp(sheet.verifiedAt, timeZone)}
            </p>
          ) : (
            <p className="mt-6 border-t border-[var(--color-ink-muted)] pt-1 text-xs text-[var(--color-ink-muted)]">
              Signature · Name · Time
            </p>
          )}
        </div>
      </section>

      {/*
        The rally log is an appendix, deliberately after the signatures: on
        paper it can run to two pages, and a signature block pushed behind it
        risks being separated from the result it agrees to.
      */}
      <div className={styles.rallyTable}>
        <RallyLog
          rows={rallies}
          source={rallySource}
          teamAName={sideName(config, 'a')}
          teamBName={sideName(config, 'b')}
          print
        />
      </div>

      <footer className={`${styles.keepTogether} border-t border-[var(--color-ink-muted)] pt-2 text-xs text-[var(--color-ink-muted)]`}>
        Printed {formatStamp(printedAtMs, timeZone)}. This sheet is the record of the match; keep it
        with the tournament papers.
      </footer>
    </article>
  )
}
