'use client'

import { useCallback } from 'react'
import { Badge, Button } from '@/components/ui'
import { TextField } from '@/components/auth'
import { ShuttlecockIcon, SparkleIcon } from '@/components/icons'
import {
  DEFAULT_ENTRY_FEE_CENTS,
  defaultRulesConfig,
  diffDivisions,
  firstErrorFor,
  formatCents,
  hasErrors,
  newId,
  parseMoneyToCents,
  roundRobinPreview,
  validateDivision,
  type DivisionSettings,
  type SettingsIssue,
} from '@/lib/settings'
import type { DivisionGender } from '@/lib/supabase/types'
import { FieldGrid, IssueList, PreviewPanel, SettingsCard, StatPill } from './Chrome'
import { SaveBar } from './SaveBar'
import { useSettingsDraft, type DraftSaveResult } from './useSettingsDraft'

export interface DivisionsEditorProps {
  initial: DivisionSettings[]
  /** Approved pairs per division id, used for the live preview. */
  entryCounts: Record<string, number>
  save: (divisions: DivisionSettings[]) => Promise<DraftSaveResult>
  readOnly?: boolean
}

const GENDERS: { value: DivisionGender; label: string }[] = [
  { value: 'mens', label: "Men's" },
  { value: 'womens', label: "Women's" },
  { value: 'mixed', label: 'Mixed' },
  { value: 'open', label: 'Open' },
]

function validate(divisions: DivisionSettings[]): SettingsIssue[] {
  const issues = divisions.flatMap((division) => validateDivision(division, divisions))
  if (divisions.length === 0) {
    issues.push({ path: 'divisions', message: 'Add at least one division.', severity: 'error' })
  } else if (!divisions.some((division) => division.enabled)) {
    issues.push({
      path: 'divisions',
      message: 'At least one division must be enabled or nobody can enter.',
      severity: 'error',
    })
  }
  return issues
}

export function DivisionsEditor({ initial, entryCounts, save, readOnly = false }: DivisionsEditorProps) {
  const form = useSettingsDraft<DivisionSettings[]>({
    initial,
    validate,
    diff: diffDivisions,
    save,
  })

  const { draft, setDraft, issues } = form

  const update = useCallback(
    (id: string, patch: Partial<DivisionSettings>) => {
      setDraft((current) =>
        current.map((division) => (division.id === id ? { ...division, ...patch } : division)),
      )
    },
    [setDraft],
  )

  const addDivision = useCallback(() => {
    setDraft((current) => [
      ...current,
      {
        id: newId('division', current),
        name: 'New division',
        gender: 'mixed',
        enabled: false,
        maxTeams: 11,
        entryFeeCents: DEFAULT_ENTRY_FEE_CENTS,
        rules: defaultRulesConfig(),
      },
    ])
  }, [setDraft])

  const removeDivision = useCallback(
    (id: string) => {
      setDraft((current) => current.filter((division) => division.id !== id))
    },
    [setDraft],
  )

  const topLevelIssues = issues.filter((issue) => issue.path === 'divisions')

  return (
    <div className="space-y-5">
      {topLevelIssues.length > 0 && <IssueList issues={topLevelIssues} />}

      {draft.map((division) => {
        const entries = entryCounts[division.id] ?? 0
        const preview = roundRobinPreview(entries)
        const capPreview = roundRobinPreview(division.maxTeams ?? entries)
        const base = `divisions.${division.id}`
        const divisionIssues = issues.filter((issue) => issue.path.startsWith(`${base}.`))

        return (
          <SettingsCard
            key={division.id}
            title={division.name || 'Untitled division'}
            description={division.enabled ? 'Open for entries.' : 'Hidden from players — no entries accepted.'}
            icon={<ShuttlecockIcon size={20} />}
            tone={division.enabled ? 'mint' : 'lilac'}
            meta={
              <div className="flex items-center gap-2">
                <Badge status={division.enabled ? 'approved' : 'pending'}>
                  {division.enabled ? 'Enabled' : 'Disabled'}
                </Badge>
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-[var(--radius-pill)] bg-white/80 px-3 py-1.5 text-sm font-semibold text-[var(--color-plum)]">
                  <input
                    type="checkbox"
                    checked={division.enabled}
                    disabled={readOnly}
                    onChange={(event) => update(division.id, { enabled: event.target.checked })}
                    className="h-4 w-4 accent-[var(--color-brand-pink-dark)]"
                  />
                  Accept entries
                </label>
              </div>
            }
          >
            <FieldGrid cols={3}>
              <TextField
                label="Division name"
                value={division.name}
                onChange={(event) => update(division.id, { name: event.target.value })}
                error={firstErrorFor(issues, `${base}.name`)}
                disabled={readOnly}
              />
              <div className="mb-4">
                <label
                  htmlFor={`${division.id}-gender`}
                  className="mb-1.5 block text-sm font-semibold text-[var(--color-plum)]"
                >
                  Category
                </label>
                <select
                  id={`${division.id}-gender`}
                  value={division.gender}
                  disabled={readOnly}
                  onChange={(event) => update(division.id, { gender: event.target.value as DivisionGender })}
                  className="w-full rounded-[var(--radius-md)] border border-[var(--color-brand-lilac-light)] bg-white px-4 py-2.5 text-[var(--color-plum)] shadow-[var(--shadow-soft)] focus:border-[var(--color-brand-pink)] focus:ring-2 focus:ring-[var(--color-brand-pink-light)] focus:outline-none disabled:opacity-60"
                >
                  {GENDERS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <TextField
                label="Entry cap (pairs)"
                type="number"
                min={2}
                max={64}
                value={division.maxTeams ?? ''}
                placeholder="No cap"
                onChange={(event) =>
                  update(division.id, {
                    maxTeams: event.target.value === '' ? null : Number.parseInt(event.target.value, 10),
                  })
                }
                hint="Leave empty for no cap."
                error={firstErrorFor(issues, `${base}.maxTeams`)}
                disabled={readOnly}
              />
              <TextField
                label="Entry fee (per player)"
                inputMode="decimal"
                defaultValue={(division.entryFeeCents / 100).toFixed(2)}
                onChange={(event) => {
                  const cents = parseMoneyToCents(event.target.value)
                  if (cents !== null) update(division.id, { entryFeeCents: cents })
                }}
                hint={`Currently ${formatCents(division.entryFeeCents)} — ${formatCents(division.entryFeeCents * 2)} a pair.`}
                error={firstErrorFor(issues, `${base}.entryFeeCents`)}
                disabled={readOnly}
              />
              <div className="mb-4 grid grid-cols-3 gap-2 sm:col-span-2">
                <StatPill label="Pairs entered" value={entries} />
                <StatPill label="Games each" value={preview.gamesEach} />
                <StatPill label="Games total" value={preview.totalGames} />
              </div>
            </FieldGrid>

            <PreviewPanel
              title="What this means"
              lines={[
                entries > 0
                  ? `${entries} pair${entries === 1 ? '' : 's'} entered → ${preview.totalGames} round robin games, ${preview.gamesEach} each.`
                  : 'No approved pairs yet — the round robin preview updates as entries are approved.',
                division.maxTeams
                  ? `At the ${division.maxTeams}-pair cap that becomes ${capPreview.totalGames} games, ${capPreview.gamesEach} each.`
                  : 'No entry cap, so the round robin grows with every entry.',
                `Entry fee ${formatCents(division.entryFeeCents)} per player · ${formatCents(division.entryFeeCents * 2)} per pair` +
                  (division.maxTeams
                    ? ` · up to ${formatCents(division.entryFeeCents * 2 * division.maxTeams)} collected.`
                    : '.'),
              ]}
            />

            <IssueList issues={divisionIssues} />

            {!readOnly && (
              <div className="mt-4 flex justify-end">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removeDivision(division.id)}
                  className="text-[var(--color-danger)]"
                >
                  Remove division
                </Button>
              </div>
            )}
          </SettingsCard>
        )
      })}

      {!readOnly && (
        <Button type="button" variant="secondary" onClick={addDivision}>
          <SparkleIcon size={18} aria-hidden="true" />
          Add a division
        </Button>
      )}

      <SaveBar
        dirty={form.dirty}
        saving={form.saving}
        canSave={form.canSave && !readOnly}
        changes={form.changes}
        result={form.result}
        celebrate={form.celebrate}
        onSave={form.submit}
        onReset={form.reset}
        blockedReason={
          hasErrors(issues) && form.dirty ? 'Fix the highlighted fields before saving.' : undefined
        }
      />
    </div>
  )
}
