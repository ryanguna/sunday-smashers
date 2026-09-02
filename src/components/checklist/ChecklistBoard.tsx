'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

import { Badge, Button, Card, CardBody, EmptyState, ToastProvider, useToast } from '@/components/ui'
import { GiftIcon, SnowflakeIcon, SparkleIcon } from '@/components/icons'
import { AlertTile } from '@/components/admin/AdminUI'
import { cn } from '@/lib/cn'
import {
  CATEGORY_BLURBS,
  CATEGORY_LABELS,
  CHECKLIST_CATEGORIES,
  addItem,
  categoryProgress,
  checklistAlerts,
  checklistCsvFilename,
  dueLabel,
  dueState,
  itemQuantity,
  nextPosition,
  progressCheer,
  progressOf,
  quantityIsPending,
  removeItem,
  toChecklistCsv,
  toggleItem,
  updateItem,
  type ChecklistCategory,
  type ChecklistItem,
  type DerivedQuantities,
} from '@/lib/checklist'
import { ChecklistProgressBar } from './ChecklistProgressBar'
import { DerivedQuantitiesPanel } from './DerivedQuantitiesPanel'
import {
  addChecklistItemAction,
  deleteChecklistItemAction,
  seedChecklistAction,
  toggleChecklistItemAction,
  updateChecklistItemAction,
  type ChecklistActionResult,
} from '@/app/admin/checklist/actions'

/**
 * The committee readiness board.
 *
 * Every edit is written immediately to its own row rather than saved as one
 * blob: the committee works through this together on tournament morning, and
 * two people ticking different jobs at once must not overwrite each other.
 * The UI updates optimistically and rolls back if the write is refused.
 */

const inputClasses =
  'w-full rounded-[var(--radius-md)] border border-[var(--color-brand-lilac-light)] bg-white px-2.5 py-1.5 text-sm text-[var(--color-ink)] focus:border-[var(--color-brand-lilac)] focus:outline-none'

const dueBadge: Record<string, 'pending' | 'unpaid' | 'info' | 'final' | 'live'> = {
  overdue: 'unpaid',
  today: 'live',
  soon: 'pending',
  later: 'info',
  none: 'info',
}

function downloadCsv(items: readonly ChecklistItem[], derived: DerivedQuantities, nowIso: string) {
  const csv = toChecklistCsv(items, derived)
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = checklistCsvFilename(nowIso)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

function ItemRow({
  item,
  derived,
  now,
  busy,
  onToggle,
  onPatch,
  onRemove,
}: {
  item: ChecklistItem
  derived: DerivedQuantities
  now: Date
  busy: boolean
  onToggle: () => void
  onPatch: (patch: Partial<Pick<ChecklistItem, 'owner' | 'notes' | 'dueDate'>>) => void
  onRemove: () => void
}) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState({ owner: item.owner, notes: item.notes, dueDate: item.dueDate })
  const quantity = itemQuantity(item, derived)
  const pendingQuantity = quantityIsPending(item, derived)
  const state = dueState(item, now)

  /** Text fields commit on blur so one keystroke isn't one round trip. */
  function commit(field: 'owner' | 'notes' | 'dueDate') {
    if (draft[field] === item[field]) return
    onPatch({ [field]: draft[field] })
  }

  return (
    <li
      className={cn(
        'rounded-[var(--radius-md)] border p-3 transition-colors',
        item.done
          ? 'border-[var(--color-success)]/30 bg-[var(--color-success-bg)]/60'
          : 'border-[var(--color-brand-lilac-light)] bg-white/70',
      )}
    >
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={item.done}
          onChange={onToggle}
          disabled={busy}
          id={`check-${item.id}`}
          className="mt-1 h-6 w-6 shrink-0 accent-[var(--color-brand-pink-dark)]"
        />
        <div className="min-w-0 flex-1">
          <label
            htmlFor={`check-${item.id}`}
            className={cn(
              'block cursor-pointer font-[family-name:var(--font-heading)] font-bold',
              item.done && 'line-through opacity-70',
            )}
            style={{ color: 'var(--color-plum)' }}
          >
            {item.label}
          </label>
          {item.detail && <p className="text-sm text-[var(--color-ink-soft)]">{item.detail}</p>}
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {quantity && (
              <Badge status={pendingQuantity ? 'pending' : 'final'}>
                <SparkleIcon size={12} className="mr-0.5" aria-hidden="true" />
                {quantity}
              </Badge>
            )}
            {item.owner ? (
              <Badge status="approved">{item.owner}</Badge>
            ) : (
              <Badge status="pending">No owner</Badge>
            )}
            {state !== 'none' && (
              <Badge status={dueBadge[state] ?? 'info'}>{dueLabel(item, now)}</Badge>
            )}
          </div>
          {item.notes && !open && (
            <p className="mt-1.5 text-sm italic text-[var(--color-ink-muted)]">{item.notes}</p>
          )}
        </div>
        <Button
          size="sm"
          variant="ghost"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? 'Close' : 'Edit'}
        </Button>
      </div>

      {open && (
        <div className="mt-3 grid gap-2 border-t border-[var(--color-brand-lilac-light)] pt-3 sm:grid-cols-2">
          <label className="text-sm">
            <span className="mb-1 block font-semibold text-[var(--color-ink-soft)]">Owner</span>
            <input
              className={inputClasses}
              value={draft.owner}
              placeholder="Who's got this?"
              disabled={busy}
              onChange={(event) => setDraft((d) => ({ ...d, owner: event.target.value }))}
              onBlur={() => commit('owner')}
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-semibold text-[var(--color-ink-soft)]">Due date</span>
            <input
              type="date"
              className={inputClasses}
              value={draft.dueDate}
              disabled={busy}
              onChange={(event) => setDraft((d) => ({ ...d, dueDate: event.target.value }))}
              onBlur={() => commit('dueDate')}
            />
          </label>
          <label className="text-sm sm:col-span-2">
            <span className="mb-1 block font-semibold text-[var(--color-ink-soft)]">Notes</span>
            <textarea
              className={cn(inputClasses, 'min-h-16 resize-y')}
              value={draft.notes}
              placeholder="Where it's stored, who to ring, what's left to buy…"
              disabled={busy}
              onChange={(event) => setDraft((d) => ({ ...d, notes: event.target.value }))}
              onBlur={() => commit('notes')}
            />
          </label>
          <div className="sm:col-span-2">
            <Button size="sm" variant="ghost" disabled={busy} onClick={onRemove}>
              Remove this job
            </Button>
          </div>
        </div>
      )}
    </li>
  )
}

export interface ChecklistBoardProps {
  initialItems: ChecklistItem[]
  derived: DerivedQuantities
  /** Resolved on the server so nothing calls `Date.now()` while rendering. */
  nowIso: string
  /** Needed to insert new jobs. Null in demo mode. */
  tournamentId: string | null
  /** True when the board is empty and can be filled with the standard jobs. */
  needsSeeding: boolean
  isDemo: boolean
}

export function ChecklistBoard(props: ChecklistBoardProps) {
  return (
    <ToastProvider>
      <ChecklistBoardInner {...props} />
    </ToastProvider>
  )
}

function ChecklistBoardInner({
  initialItems,
  derived,
  nowIso,
  tournamentId,
  needsSeeding,
  isDemo,
}: ChecklistBoardProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [pending, startTransition] = useTransition()
  const [items, setItems] = useState<ChecklistItem[]>(initialItems)
  const [newLabel, setNewLabel] = useState('')
  const [newCategory, setNewCategory] = useState<ChecklistCategory>(CHECKLIST_CATEGORIES[0])

  const now = useMemo(() => new Date(nowIso), [nowIso])
  const overall = progressOf(items)
  const groups = categoryProgress(items)
  const alerts = checklistAlerts(items, derived, now)

  /**
   * Optimistic write: show it immediately, roll back if the server refuses.
   * Demo mode has no database, so the local state simply stands.
   */
  function persist(next: ChecklistItem[], action: () => Promise<ChecklistActionResult>) {
    const previous = items
    setItems(next)
    startTransition(async () => {
      const result = await action()
      if (result.ok) {
        router.refresh()
        return
      }
      if (result.demo) {
        toast({ title: 'Demo mode', description: result.message, variant: 'warning' })
        return
      }
      setItems(previous)
      toast({ title: 'That did not save', description: result.message, variant: 'danger' })
    })
  }

  function seed() {
    if (!tournamentId) return
    startTransition(async () => {
      const result = await seedChecklistAction(tournamentId)
      toast({
        title: result.ok ? 'Board ready' : result.demo ? 'Demo mode' : 'That did not work',
        description: result.message,
        variant: result.ok ? 'festive' : result.demo ? 'warning' : 'danger',
      })
      if (result.ok) router.refresh()
    })
  }

  function addJob() {
    const label = newLabel.trim()
    if (label === '') return
    const position = nextPosition(items)
    const next = addItem(items, { category: newCategory, label })
    setNewLabel('')
    persist(next, () =>
      tournamentId
        ? addChecklistItemAction({ tournamentId, category: newCategory, label, position })
        : Promise.resolve({
            ok: false,
            demo: true,
            message: 'Demo mode — the job is on screen but not saved.',
          }),
    )
  }

  if (items.length === 0) {
    return (
      <EmptyState
        icon={<GiftIcon size={40} />}
        title="No jobs on the board yet"
        description="Start from the standard Sunday Smashers checklist — loot bags, medals, shuttles, scoresheets and the rest — then add your own."
        action={
          needsSeeding ? (
            <Button variant="festive" disabled={pending} onClick={seed}>
              Set up the standard checklist
            </Button>
          ) : undefined
        }
      />
    )
  }

  return (
    <div className="space-y-6">
      <Card variant="candy-stripe">
        <CardBody className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-[family-name:var(--font-script)] text-2xl text-[var(--color-brand-pink-dark)]">
                {progressCheer(overall.percent)}
              </p>
              <p className="text-sm text-[var(--color-ink-soft)]">
                {overall.done} of {overall.total} jobs ticked off across {groups.length} categories.
                Every tick saves on its own, so the whole committee can work at once.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => downloadCsv(items, derived, nowIso)}>
                Export CSV
              </Button>
              <Button variant="ghost" href="/admin/checklist/print" target="_blank" rel="noreferrer">
                Printable view
              </Button>
            </div>
          </div>
          <ChecklistProgressBar progress={overall} label="Overall readiness" size="lg" />
          {isDemo && (
            <p className="text-sm text-[var(--color-warn)]">
              Demo mode — tick away, but nothing is written to a database.
            </p>
          )}
        </CardBody>
      </Card>

      {alerts.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          {alerts.map((alert) => (
            <AlertTile
              key={alert.title}
              tone={alert.tone}
              title={alert.title}
              detail={alert.detail}
            />
          ))}
        </div>
      )}

      <DerivedQuantitiesPanel derived={derived} />

      <div className="space-y-5">
        {groups.map((group) => (
          <Card key={group.category} variant="frosted">
            <CardBody className="space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2
                    className="font-[family-name:var(--font-heading)] text-xl font-extrabold"
                    style={{ color: 'var(--color-plum)' }}
                  >
                    {CATEGORY_LABELS[group.category]}
                  </h2>
                  <p className="text-sm text-[var(--color-ink-soft)]">
                    {CATEGORY_BLURBS[group.category]}
                  </p>
                </div>
                <SnowflakeIcon
                  size={22}
                  className="text-[var(--color-brand-sky-dark)]"
                  aria-hidden="true"
                />
              </div>
              <ChecklistProgressBar
                progress={group}
                label={`${CATEGORY_LABELS[group.category]} progress`}
              />
              <ul className="space-y-2">
                {group.items.map((item) => (
                  <ItemRow
                    key={item.id}
                    item={item}
                    derived={derived}
                    now={now}
                    busy={pending}
                    onToggle={() =>
                      persist(toggleItem(items, item.id), () =>
                        toggleChecklistItemAction(item.id, !item.done, item.label, item.category),
                      )
                    }
                    onPatch={(patch) =>
                      persist(updateItem(items, item.id, patch), () =>
                        updateChecklistItemAction(item.id, patch, item.label),
                      )
                    }
                    onRemove={() =>
                      persist(removeItem(items, item.id), () =>
                        deleteChecklistItemAction(item.id, item.label, item.category),
                      )
                    }
                  />
                ))}
              </ul>
            </CardBody>
          </Card>
        ))}
      </div>

      <Card variant="frosted">
        <CardBody className="flex flex-wrap items-end gap-2">
          <span className="text-[var(--color-brand-pink-dark)]" aria-hidden="true">
            <GiftIcon size={22} />
          </span>
          <label className="min-w-56 flex-1 text-sm">
            <span className="mb-1 block font-semibold text-[var(--color-ink-soft)]">
              Add another job
            </span>
            <input
              className={inputClasses}
              value={newLabel}
              placeholder="Borrow the big speaker"
              onChange={(event) => setNewLabel(event.target.value)}
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-semibold text-[var(--color-ink-soft)]">Category</span>
            <select
              className={inputClasses}
              value={newCategory}
              onChange={(event) => setNewCategory(event.target.value as ChecklistCategory)}
            >
              {CHECKLIST_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {CATEGORY_LABELS[category]}
                </option>
              ))}
            </select>
          </label>
          <Button
            size="sm"
            variant="secondary"
            disabled={pending || newLabel.trim().length === 0}
            onClick={addJob}
          >
            Add
          </Button>
        </CardBody>
      </Card>
    </div>
  )
}
