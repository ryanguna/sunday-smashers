'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

import { Badge, Button, Card, CardBody } from '@/components/ui'
import { SparkleIcon } from '@/components/icons'
import {
  AWARD_ICON_KEYS,
  awardKeyFromLabel,
  isBuiltInAwardKey,
  validateAwardCategory,
  type AwardCategoryDraft,
  type AwardDefinition,
  type AwardIconKey,
  type AwardScope,
} from '@/lib/awards'
import { deleteAwardCategoryAction, saveAwardCategoryAction } from './actions'

/**
 * Editing the award catalogue itself.
 *
 * `parseDefinitions` in `./data` has always merged overrides from
 * `site_content['award-config']` over the shipped list, but nothing ever wrote
 * that row: adding "best Christmas jumper" meant hand-editing JSON in the SQL
 * editor while the console advertised the awards as configurable.
 *
 * Placings are excluded on purpose. They are computed from the results by
 * `derivePlacingAwards`, and a hand-typed champion sitting next to a derived
 * one is the "one value, two homes" defect this project keeps unpicking.
 */

const inputClasses =
  'w-full rounded-[var(--radius-md)] border border-[var(--color-brand-lilac-light)] bg-white px-3 py-2 text-sm text-[var(--color-ink)] shadow-sm focus:border-[var(--color-brand-lilac)] focus:outline-none'

const EMPTY: AwardCategoryDraft = {
  key: '',
  label: '',
  blurb: '',
  scope: 'player',
  icon: 'sparkle',
}

export interface AwardCategoriesPanelProps {
  definitions: readonly AwardDefinition[]
  isDemo: boolean
}

export function AwardCategoriesPanel({ definitions, isDemo }: AwardCategoriesPanelProps) {
  const router = useRouter()
  const [draft, setDraft] = useState<AwardCategoryDraft>(EMPTY)
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [note, setNote] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null)
  const [pending, startTransition] = useTransition()

  const special = definitions.filter((definition) => definition.category === 'special')
  // The key is derived from the name while adding, but frozen once a category
  // exists: it is what `awards.award_key` rows already point at, and changing
  // it would orphan every award already handed out under the old name.
  const key = editingKey ?? awardKeyFromLabel(draft.label)
  const problem = validateAwardCategory({ ...draft, key })

  const reset = () => {
    setDraft(EMPTY)
    setEditingKey(null)
  }

  const edit = (definition: AwardDefinition) => {
    setEditingKey(definition.key)
    setDraft({
      key: definition.key,
      label: definition.label,
      blurb: definition.blurb,
      scope: definition.scope,
      icon: definition.icon,
    })
    setNote(null)
  }

  const save = () => {
    if (problem) {
      setNote({ tone: 'bad', text: problem })
      return
    }
    startTransition(async () => {
      const result = await saveAwardCategoryAction({ ...draft, key })
      setNote({ tone: result.ok ? 'ok' : 'bad', text: result.message })
      if (result.ok) {
        reset()
        router.refresh()
      }
    })
  }

  const remove = (definition: AwardDefinition) => {
    startTransition(async () => {
      const result = await deleteAwardCategoryAction(definition.key)
      setNote({ tone: result.ok ? 'ok' : 'bad', text: result.message })
      if (result.ok) {
        if (editingKey === definition.key) reset()
        router.refresh()
      }
    })
  }

  return (
    <Card variant="frosted" className="mt-6">
      <CardBody className="grid gap-4 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[image:var(--gradient-candy)] text-[var(--color-plum)]">
            <SparkleIcon size={16} aria-hidden="true" />
          </span>
          <h2 className="text-lg font-extrabold" style={{ color: 'var(--color-plum)' }}>
            Award categories
          </h2>
          <Badge status="info" className="ml-auto">
            {special.length} discretionary
          </Badge>
        </div>

        <p className="text-sm text-[var(--color-ink-soft)]">
          Name the gongs you want to hand out. Champion, runner-up and the placings aren’t
          here — they come straight from the results.
        </p>

        <ul className="grid gap-2">
          {special.map((definition) => (
            <li
              key={definition.key}
              className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[var(--radius-lg)] bg-white/85 px-3 py-2.5"
            >
              <span className="font-bold text-[var(--color-plum)]">{definition.label}</span>
              <Badge status="info">{definition.scope === 'team' ? 'A pair' : 'A player'}</Badge>
              <span className="w-full text-xs text-[var(--color-ink-muted)] sm:w-auto sm:flex-1">
                {definition.blurb}
              </span>
              <span className="ml-auto flex gap-2">
                <Button size="sm" variant="ghost" onClick={() => edit(definition)} disabled={pending}>
                  Edit
                </Button>
                <Button size="sm" variant="ghost" onClick={() => remove(definition)} disabled={pending}>
                  {isBuiltInAwardKey(definition.key) ? 'Reset' : 'Remove'}
                </Button>
              </span>
            </li>
          ))}
        </ul>

        <div className="grid gap-3 rounded-[var(--radius-lg)] bg-white/70 p-4">
          <h3 className="font-[family-name:var(--font-heading)] font-bold text-[var(--color-plum)]">
            {editingKey ? `Editing “${draft.label || editingKey}”` : 'Add an award'}
          </h3>

          <label className="grid gap-1 text-sm font-semibold text-[var(--color-plum)]">
            Name
            <input
              className={inputClasses}
              value={draft.label}
              placeholder="Best Christmas jumper"
              onChange={(event) => setDraft({ ...draft, label: event.target.value })}
            />
          </label>

          <label className="grid gap-1 text-sm font-semibold text-[var(--color-plum)]">
            One-liner
            <input
              className={inputClasses}
              value={draft.blurb}
              placeholder="The outfit that made the gym laugh loudest."
              onChange={(event) => setDraft({ ...draft, blurb: event.target.value })}
            />
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-sm font-semibold text-[var(--color-plum)]">
              Goes to
              <select
                className={inputClasses}
                value={draft.scope}
                onChange={(event) =>
                  setDraft({ ...draft, scope: event.target.value as AwardScope })
                }
              >
                <option value="player">A player</option>
                <option value="team">A pair</option>
              </select>
            </label>

            <label className="grid gap-1 text-sm font-semibold text-[var(--color-plum)]">
              Icon
              <select
                className={inputClasses}
                value={draft.icon}
                onChange={(event) =>
                  setDraft({ ...draft, icon: event.target.value as AwardIconKey })
                }
              >
                {AWARD_ICON_KEYS.map((icon) => (
                  <option key={icon} value={icon}>
                    {icon}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={save} loading={pending} disabled={pending}>
              {editingKey ? 'Save changes' : 'Add the award'}
            </Button>
            {editingKey && (
              <Button variant="ghost" onClick={reset} disabled={pending}>
                Cancel
              </Button>
            )}
            {isDemo && (
              <span className="text-xs text-[var(--color-ink-muted)]">
                Demo mode — nothing is saved.
              </span>
            )}
          </div>
        </div>

        {note && (
          <p
            role="status"
            className={
              note.tone === 'ok'
                ? 'rounded-[var(--radius-lg)] bg-[var(--color-success-bg)] px-3 py-2 text-sm font-semibold text-[var(--color-success)]'
                : 'rounded-[var(--radius-lg)] bg-[var(--color-danger-bg)] px-3 py-2 text-sm font-semibold text-[var(--color-danger)]'
            }
          >
            {note.text}
          </p>
        )}
      </CardBody>
    </Card>
  )
}
