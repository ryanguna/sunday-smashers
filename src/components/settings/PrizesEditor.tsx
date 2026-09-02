'use client'

import { useCallback } from 'react'
import { Button } from '@/components/ui'
import { TextField } from '@/components/auth'
import { GiftIcon, MedalIcon, SparkleIcon, TrophyIcon } from '@/components/icons'
import {
  diffPrizes,
  firstErrorFor,
  formatCents,
  lootBagTotals,
  newId,
  parseMoneyToCents,
  totalPrizePoolCents,
  validatePrizes,
  type DivisionSettings,
  type PrizeSettings,
  type SettingsIssue,
} from '@/lib/settings'
import { FieldGrid, IssueList, PreviewPanel, SettingsCard, StatPill, SwitchRow } from './Chrome'
import { SaveBar } from './SaveBar'
import { useSettingsDraft, type DraftSaveResult } from './useSettingsDraft'

export interface PrizesEditorProps {
  initial: PrizeSettings
  divisions: DivisionSettings[]
  /** Players expected to collect a loot bag. */
  playerCount: number
  save: (prizes: PrizeSettings) => Promise<DraftSaveResult>
  readOnly?: boolean
}

export function PrizesEditor({ initial, divisions, playerCount, save, readOnly = false }: PrizesEditorProps) {
  const validate = useCallback(
    (prizes: PrizeSettings): SettingsIssue[] => validatePrizes(prizes, divisions),
    [divisions],
  )

  const form = useSettingsDraft<PrizeSettings>({ initial, validate, diff: diffPrizes, save })
  const { draft, setDraft, issues } = form

  const updatePrize = useCallback(
    (divisionId: string, patch: Partial<{ championCents: number; runnerUpCents: number; thirdPlaceCents: number }>) => {
      setDraft((current) => ({
        ...current,
        divisionPrizes: current.divisionPrizes.some((prize) => prize.divisionId === divisionId)
          ? current.divisionPrizes.map((prize) =>
              prize.divisionId === divisionId ? { ...prize, ...patch } : prize,
            )
          : [
              ...current.divisionPrizes,
              { divisionId, championCents: 0, runnerUpCents: 0, thirdPlaceCents: 0, ...patch },
            ],
      }))
    },
    [setDraft],
  )

  const updateLoot = useCallback(
    (id: string, patch: Partial<{ name: string; quantity: number; notes: string }>) => {
      setDraft((current) => ({
        ...current,
        lootBagItems: current.lootBagItems.map((item) => (item.id === id ? { ...item, ...patch } : item)),
      }))
    },
    [setDraft],
  )

  const addLoot = useCallback(() => {
    setDraft((current) => ({
      ...current,
      lootBagItems: [
        ...current.lootBagItems,
        { id: newId('loot', current.lootBagItems), name: '', quantity: 1, notes: '' },
      ],
    }))
  }, [setDraft])

  const removeLoot = useCallback(
    (id: string) => {
      setDraft((current) => ({
        ...current,
        lootBagItems: current.lootBagItems.filter((item) => item.id !== id),
      }))
    },
    [setDraft],
  )

  const pool = totalPrizePoolCents(draft)
  const totals = lootBagTotals(draft, playerCount)

  return (
    <div className="space-y-5">
      <SettingsCard
        title="Cash prizes"
        description="Paid out at the presentation, per division."
        icon={<TrophyIcon size={20} />}
        tone="gold"
        meta={<StatPill label="Total pool" value={formatCents(pool)} />}
      >
        <div className="space-y-4">
          {divisions.map((division) => {
            const prize =
              draft.divisionPrizes.find((row) => row.divisionId === division.id) ??
              { divisionId: division.id, championCents: 0, runnerUpCents: 0, thirdPlaceCents: 0 }
            const base = `prizes.${division.id}`

            return (
              <div
                key={division.id}
                className="rounded-[var(--radius-md)] border border-[var(--color-brand-gold)]/40 bg-[var(--color-brand-gold-light)]/30 p-4"
              >
                <h3 className="mb-3 font-[family-name:var(--font-heading)] font-bold text-[var(--color-plum)]">
                  {division.name}
                  {!division.enabled && (
                    <span className="ml-2 text-sm font-normal text-[var(--color-ink-muted)]">(disabled)</span>
                  )}
                </h3>
                <FieldGrid cols={3}>
                  <TextField
                    label="🥇 Champion"
                    inputMode="decimal"
                    defaultValue={(prize.championCents / 100).toFixed(2)}
                    onChange={(event) => {
                      const cents = parseMoneyToCents(event.target.value)
                      if (cents !== null) updatePrize(division.id, { championCents: cents })
                    }}
                    hint={formatCents(prize.championCents)}
                    error={firstErrorFor(issues, `${base}.championCents`)}
                    disabled={readOnly}
                  />
                  <TextField
                    label="🥈 Runner-up"
                    inputMode="decimal"
                    defaultValue={(prize.runnerUpCents / 100).toFixed(2)}
                    onChange={(event) => {
                      const cents = parseMoneyToCents(event.target.value)
                      if (cents !== null) updatePrize(division.id, { runnerUpCents: cents })
                    }}
                    hint={formatCents(prize.runnerUpCents)}
                    error={firstErrorFor(issues, `${base}.runnerUpCents`)}
                    disabled={readOnly}
                  />
                  <TextField
                    label="🥉 Battle for 3rd"
                    inputMode="decimal"
                    defaultValue={(prize.thirdPlaceCents / 100).toFixed(2)}
                    onChange={(event) => {
                      const cents = parseMoneyToCents(event.target.value)
                      if (cents !== null) updatePrize(division.id, { thirdPlaceCents: cents })
                    }}
                    hint={formatCents(prize.thirdPlaceCents)}
                    error={firstErrorFor(issues, `${base}.thirdPlaceCents`)}
                    disabled={readOnly}
                  />
                </FieldGrid>
              </div>
            )
          })}
        </div>
      </SettingsCard>

      <SettingsCard
        title="Silverware"
        description="How many trophies and medals to order."
        icon={<MedalIcon size={20} />}
        tone="sky"
      >
        <FieldGrid>
          <TextField
            label="Trophies"
            type="number"
            min={0}
            value={draft.trophyCount}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                trophyCount: Number.parseInt(event.target.value, 10) || 0,
              }))
            }
            hint="Usually one per division champion."
            error={firstErrorFor(issues, 'prizes.trophyCount')}
            disabled={readOnly}
          />
          <TextField
            label="Medals"
            type="number"
            min={0}
            value={draft.medalCount}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                medalCount: Number.parseInt(event.target.value, 10) || 0,
              }))
            }
            hint="Doubles means 2 players per placing — gold, silver and bronze."
            error={firstErrorFor(issues, 'prizes.medalCount')}
            disabled={readOnly}
          />
        </FieldGrid>
      </SettingsCard>

      <SettingsCard
        title="Announce the prizes"
        description="Until this is on, the landing page just promises that details are coming."
        icon={<SparkleIcon size={20} />}
        tone="gold"
      >
        <SwitchRow
          label="Show prize money on the public site"
          description={
            draft.showOnPublicSite
              ? `Visitors see the full breakdown per division — ${formatCents(pool)} in total.`
              : 'Off while the amounts are still being decided. Turn it on once the budget is final.'
          }
          checked={draft.showOnPublicSite}
          disabled={readOnly}
          onChange={(next) => setDraft((current) => ({ ...current, showOnPublicSite: next }))}
        />
        <p className="mt-3 text-sm text-[var(--color-ink-soft)]">
          Only the amounts, trophy and medal counts and loot bag contents are published. Your
          per-item notes stay in the committee console.
        </p>
      </SettingsCard>

      <SettingsCard
        title="Loot bags"
        description="Every player goes home with one."
        icon={<GiftIcon size={20} />}
        tone="pink"
        meta={<StatPill label="Players" value={playerCount} />}
      >
        <ul className="space-y-3">
          {draft.lootBagItems.map((item) => (
            <li
              key={item.id}
              className="flex flex-wrap items-end gap-3 rounded-[var(--radius-md)] bg-[var(--color-brand-pink-light)]/25 p-3"
            >
              <div className="min-w-[10rem] flex-1">
                <TextField
                  label="Item"
                  value={item.name}
                  placeholder="Shuttlecock tube"
                  onChange={(event) => updateLoot(item.id, { name: event.target.value })}
                  error={firstErrorFor(issues, `prizes.loot.${item.id}.name`)}
                  disabled={readOnly}
                />
              </div>
              <div className="w-28">
                <TextField
                  label="Per player"
                  type="number"
                  min={1}
                  value={item.quantity}
                  onChange={(event) =>
                    updateLoot(item.id, { quantity: Number.parseInt(event.target.value, 10) || 0 })
                  }
                  error={firstErrorFor(issues, `prizes.loot.${item.id}.quantity`)}
                  disabled={readOnly}
                />
              </div>
              <div className="min-w-[12rem] flex-1">
                <TextField
                  label="Notes"
                  value={item.notes}
                  placeholder="Assorted pastel colours"
                  onChange={(event) => updateLoot(item.id, { notes: event.target.value })}
                  disabled={readOnly}
                />
              </div>
              {!readOnly && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="mb-4 text-[var(--color-danger)]"
                  onClick={() => removeLoot(item.id)}
                >
                  Remove
                </Button>
              )}
            </li>
          ))}
        </ul>

        {!readOnly && (
          <Button type="button" variant="secondary" size="sm" className="mt-3 mb-4" onClick={addLoot}>
            <SparkleIcon size={16} aria-hidden="true" />
            Add loot bag item
          </Button>
        )}

        <PreviewPanel
          title="Shopping list"
          lines={
            totals.length > 0
              ? totals.map((row) => `${row.name || 'Unnamed item'} × ${row.total} (for ${playerCount} players)`)
              : ['Nothing in the loot bags yet.']
          }
          footer={
            <p className="text-sm text-[var(--color-ink-soft)]">
              Prize pool {formatCents(pool)} · {draft.trophyCount} trophies · {draft.medalCount} medals.
            </p>
          }
        />

        <IssueList issues={issues} />
      </SettingsCard>

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
          form.dirty && form.errors.length > 0 ? 'Fix the highlighted fields before saving.' : undefined
        }
      />
    </div>
  )
}
