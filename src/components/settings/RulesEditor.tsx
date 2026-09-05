'use client'

import { useCallback, useMemo, useState } from 'react'
import { Badge } from '@/components/ui'
import { TextField } from '@/components/auth'
import { HollyIcon, RacketIcon, SparkleIcon, TrophyIcon } from '@/components/icons'
import {
  analyseSettingsRulesChange,
  describeDivisionFormat,
  diffDivisions,
  estimateDayLoad,
  firstErrorFor,
  knockoutGameCount,
  roundRobinPreview,
  STAGE_BLURBS,
  STAGE_KEYS,
  STAGE_LABELS,
  summariseStage,
  validateDivision,
  type DivisionSettings,
  type DrawState,
  type RulesChangeImpact,
  type SettingsIssue,
  type StageKey,
  type StageRulesConfig,
} from '@/lib/settings'
import { FieldGrid, IssueList, PreviewPanel, SettingsCard, StatPill } from './Chrome'
import { SaveBar } from './SaveBar'
import { useSettingsDraft, type DraftSaveResult } from './useSettingsDraft'

export interface RulesEditorProps {
  initial: DivisionSettings[]
  entryCounts: Record<string, number>
  courtCount: number
  drawState: DrawState
  save: (divisions: DivisionSettings[]) => Promise<DraftSaveResult>
  readOnly?: boolean
}

const CONFIRM_PHRASE = 'CHANGE RULES'

function validate(divisions: DivisionSettings[]): SettingsIssue[] {
  return divisions.flatMap((division) => validateDivision(division, divisions))
}

function StageEditor({
  divisionId,
  stage,
  config,
  issues,
  disabled,
  onChange,
}: {
  divisionId: string
  stage: StageKey
  config: StageRulesConfig
  issues: readonly SettingsIssue[]
  disabled: boolean
  onChange: (patch: Partial<StageRulesConfig>) => void
}) {
  const base = `divisions.${divisionId}.rules.${stage}`

  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--color-brand-lilac-light)] bg-[var(--color-frost)] p-4">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <h3 className="font-[family-name:var(--font-heading)] text-base font-bold text-[var(--color-plum)]">
            {STAGE_LABELS[stage]}
          </h3>
          <p className="text-xs text-[var(--color-ink-muted)]">{STAGE_BLURBS[stage]}</p>
        </div>
        <Badge status="final">{summariseStage(config)}</Badge>
      </div>

      <FieldGrid>
        <TextField
          label="Points to win"
          type="number"
          min={1}
          max={99}
          value={Number.isFinite(config.pointsToWin) ? config.pointsToWin : ''}
          onChange={(event) => onChange({ pointsToWin: Number.parseInt(event.target.value, 10) })}
          error={firstErrorFor(issues, `${base}.pointsToWin`)}
          disabled={disabled}
        />
        <TextField
          label="Point cap (deuce only)"
          type="number"
          min={2}
          max={99}
          value={config.cap ?? ''}
          placeholder="No cap"
          onChange={(event) =>
            onChange({ cap: event.target.value === '' ? null : Number.parseInt(event.target.value, 10) })
          }
          error={firstErrorFor(issues, `${base}.cap`)}
          disabled={disabled || !config.deuce}
          hint={config.deuce ? 'Highest score that ends the game outright.' : 'Enable deuce to use a cap.'}
        />
      </FieldGrid>

      <label className="flex cursor-pointer items-start gap-3 rounded-[var(--radius-md)] bg-white p-3">
        <input
          type="checkbox"
          checked={config.deuce}
          disabled={disabled}
          onChange={(event) => onChange({ deuce: event.target.checked })}
          className="mt-0.5 h-6 w-6 shrink-0 accent-[var(--color-brand-pink-dark)]"
        />
        <span className="text-sm">
          <span className="block font-semibold text-[var(--color-plum)]">Play deuce (win by 2)</span>
          <span className="text-[var(--color-ink-soft)]">
            The draft rules say <strong>no deuce</strong> — reaching the target wins the game outright.
          </span>
        </span>
      </label>
    </div>
  )
}

function ImpactBanner({ impact }: { impact: RulesChangeImpact }) {
  if (impact.level === 'none') return null

  const tone =
    impact.level === 'danger'
      ? 'border-[var(--color-danger)] bg-[var(--color-danger-bg)] text-[var(--color-danger)]'
      : impact.level === 'caution'
        ? 'border-[var(--color-warn)] bg-[var(--color-warn-bg)] text-[var(--color-warn)]'
        : 'border-[var(--color-success)] bg-[var(--color-success-bg)] text-[var(--color-success)]'

  return (
    <div role={impact.level === 'danger' ? 'alert' : 'status'} className={`rounded-[var(--radius-lg)] border-2 p-4 ${tone}`}>
      <p className="flex items-center gap-2 font-[family-name:var(--font-heading)] text-base font-bold">
        {impact.level === 'safe' ? (
          <SparkleIcon size={20} aria-hidden="true" />
        ) : (
          <HollyIcon size={20} aria-hidden="true" />
        )}
        {impact.headline}
      </p>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
        {impact.reasons.map((reason, i) => (
          <li key={i}>{reason}</li>
        ))}
      </ul>
      {impact.requiresRegeneration && (
        <p className="mt-2 text-sm font-semibold">
          After saving you must regenerate the draw on /admin/draw so the published bracket matches these
          rules.
        </p>
      )}
    </div>
  )
}

export function RulesEditor({
  initial,
  entryCounts,
  courtCount,
  drawState,
  save,
  readOnly = false,
}: RulesEditorProps) {
  const form = useSettingsDraft<DivisionSettings[]>({ initial, validate, diff: diffDivisions, save })
  const { draft, saved, setDraft, issues } = form

  const [acknowledged, setAcknowledged] = useState(false)
  const [confirmText, setConfirmText] = useState('')

  const impact = useMemo(
    () => analyseSettingsRulesChange(saved, draft, drawState),
    [saved, draft, drawState],
  )

  const updateStage = useCallback(
    (divisionId: string, stage: StageKey, patch: Partial<StageRulesConfig>) => {
      setAcknowledged(false)
      setConfirmText('')
      setDraft((current) =>
        current.map((division) =>
          division.id === divisionId
            ? {
                ...division,
                rules: {
                  ...division.rules,
                  stages: { ...division.rules.stages, [stage]: { ...division.rules.stages[stage], ...patch } },
                },
              }
            : division,
        ),
      )
    },
    [setDraft],
  )

  const updateQualifiers = useCallback(
    (divisionId: string, places: number) => {
      setAcknowledged(false)
      setConfirmText('')
      setDraft((current) =>
        current.map((division) =>
          division.id === divisionId
            ? { ...division, rules: { ...division.rules, qualifyingPlaces: places } }
            : division,
        ),
      )
    },
    [setDraft],
  )

  const confirmationSatisfied =
    !impact.requiresConfirmation ||
    (impact.level === 'danger'
      ? confirmText.trim().toUpperCase() === CONFIRM_PHRASE
      : acknowledged)

  const blockedReason = !form.dirty
    ? undefined
    : form.errors.length > 0
      ? 'Fix the highlighted fields before saving.'
      : !confirmationSatisfied
        ? impact.level === 'danger'
          ? `Type “${CONFIRM_PHRASE}” below to confirm this change.`
          : 'Tick the acknowledgement below to confirm this change.'
        : undefined

  return (
    <div className="space-y-5">
      <SettingsCard
        title="Scoring & format"
        description="Every value below feeds the draw, scoring and standings engines directly."
        icon={<RacketIcon size={20} />}
        tone="gold"
      >
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <StatPill label="Draw published" value={drawState.drawPublished ? 'Yes' : 'Not yet'} />
          <StatPill label="Scheduled" value={drawState.matchesScheduled} />
          <StatPill label="In progress" value={drawState.matchesInProgress} />
          <StatPill label="Completed" value={drawState.matchesCompleted} />
        </div>
        <p className="mt-3 text-sm text-[var(--color-ink-soft)]">
          {drawState.drawPublished
            ? 'The draw is already published, so rule edits are checked against what has been played.'
            : 'Nothing is published yet — this is the safest possible moment to settle the rules.'}
        </p>
      </SettingsCard>

      <ImpactBanner impact={impact} />

      {draft.map((division) => {
        const entries = entryCounts[division.id] ?? division.maxTeams ?? 0
        const preview = roundRobinPreview(entries)
        const load = estimateDayLoad(division, entries, courtCount)
        const base = `divisions.${division.id}`

        return (
          <SettingsCard
            key={division.id}
            title={`${division.name} · scoring`}
            description="Configured per stage, exactly like the draft rules sheet."
            icon={<TrophyIcon size={20} />}
            tone="pink"
            meta={<Badge status="info">{`Top ${division.rules.qualifyingPlaces} qualify`}</Badge>}
          >
            <div className="grid gap-4 lg:grid-cols-2">
              {STAGE_KEYS.map((stage) => (
                <StageEditor
                  key={stage}
                  divisionId={division.id}
                  stage={stage}
                  config={division.rules.stages[stage]}
                  issues={issues}
                  disabled={readOnly}
                  onChange={(patch) => updateStage(division.id, stage, patch)}
                />
              ))}
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <div>
                <TextField
                  label="Pairs advancing to the knockout"
                  type="number"
                  min={2}
                  max={4}
                  step={2}
                  value={division.rules.qualifyingPlaces}
                  onChange={(event) =>
                    updateQualifiers(division.id, Number.parseInt(event.target.value, 10))
                  }
                  hint="The draft rules qualify the top 4. Use 2 for a straight final — no semis, no Battle for 3rd."
                  error={firstErrorFor(issues, `${base}.rules.qualifyingPlaces`)}
                  disabled={readOnly}
                />
                <div className="grid grid-cols-3 gap-2">
                  <StatPill label="RR games" value={preview.totalGames} />
                  <StatPill label="Knockout" value={knockoutGameCount(division.rules.qualifyingPlaces)} />
                  <StatPill label="Games each" value={preview.gamesEach} />
                </div>
              </div>

              <PreviewPanel
                title="What this means"
                lines={[
                  ...describeDivisionFormat(division, entries),
                  `Roughly ${load.totalCourtMinutes} minutes of court time — about ${load.estimatedMinutes} minutes across ${Math.max(1, courtCount)} court${courtCount === 1 ? '' : 's'}.`,
                ]}
              />
            </div>

            <IssueList issues={issues.filter((issue) => issue.path.startsWith(`${base}.rules`))} />
          </SettingsCard>
        )
      })}

      <SaveBar
        dirty={form.dirty}
        saving={form.saving}
        canSave={form.canSave && confirmationSatisfied && !readOnly}
        changes={form.changes}
        result={form.result}
        celebrate={form.celebrate}
        onSave={form.submit}
        onReset={form.reset}
        blockedReason={blockedReason}
      >
        {form.dirty && impact.requiresConfirmation && impact.level === 'caution' && (
          <label className="mt-3 flex cursor-pointer items-start gap-3 border-t border-black/5 pt-3 text-sm">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(event) => setAcknowledged(event.target.checked)}
              className="mt-0.5 h-6 w-6 shrink-0 accent-[var(--color-brand-pink-dark)]"
            />
            <span className="text-[var(--color-ink-soft)]">
              I understand the draw is already published and I will tell the players what changed.
            </span>
          </label>
        )}

        {form.dirty && impact.requiresConfirmation && impact.level === 'danger' && (
          <div className="mt-3 border-t border-black/5 pt-3">
            <label
              htmlFor="rules-confirm"
              className="mb-1.5 block text-sm font-semibold text-[var(--color-danger)]"
            >
              Games have already been played. Type <strong>{CONFIRM_PHRASE}</strong> to confirm.
            </label>
            <input
              id="rules-confirm"
              value={confirmText}
              onChange={(event) => setConfirmText(event.target.value)}
              placeholder={CONFIRM_PHRASE}
              autoComplete="off"
              className="w-full max-w-xs rounded-[var(--radius-md)] border-2 border-[var(--color-danger)] bg-white px-4 py-2 text-[var(--color-plum)] focus:ring-2 focus:ring-[var(--color-danger)] focus:outline-none"
            />
          </div>
        )}
      </SaveBar>
    </div>
  )
}
