'use client'

import { useState } from 'react'

import { EmptyState, ToastProvider, useToast } from '@/components/ui'
import { MedalIcon, RacketIcon, ShuttlecockIcon, TrophyIcon } from '@/components/icons'
import { StatCard } from '@/components/admin/AdminUI'
import { MatchesFilterBar } from '@/components/admin/MatchesFilterBar'
import { MatchesTable } from '@/components/admin/MatchesTable'
import { MatchesResultDialog } from '@/components/admin/MatchesResultDialog'
import {
  MatchesRescheduleDialog,
  type RescheduleContextData,
} from '@/components/admin/MatchesRescheduleDialog'
import {
  EMPTY_MATCH_FILTERS,
  filterMatches,
  matchAdminStats,
  type AdminMatchRow,
  type MatchFilters,
  type MatchResultPatch,
  type ReschedulePatch,
} from '@/lib/match-admin'
import { rescheduleMatch, saveMatchResult } from '@/app/admin/matches/actions'

/**
 * The match management console — the app's only after-the-fact override.
 *
 * `/scoring` records a match as it happens and `/tabulator` verifies the
 * paper, but neither can put right a score entered against the wrong fixture,
 * a pair that no-showed after the sheet was signed, or a court that had to
 * change at 11am. This is where an admin does that, and every action shows
 * exactly what it will write before it writes it.
 *
 * Data comes down as props from the Server Component — no `useEffect`
 * fetching — and after a successful write the page is revalidated on the
 * server, so the table redraws from the database rather than from an
 * optimistic guess. On this screen being *right* beats being instant.
 */

function MatchesConsoleInner({
  rows,
  divisions,
  context,
  isDemo,
}: {
  rows: readonly AdminMatchRow[]
  divisions: readonly { id: string; name: string }[]
  context: RescheduleContextData
  isDemo: boolean
}) {
  const { toast } = useToast()
  const [filters, setFilters] = useState<MatchFilters>(EMPTY_MATCH_FILTERS)
  const [resultRow, setResultRow] = useState<AdminMatchRow | null>(null)
  const [moveRow, setMoveRow] = useState<AdminMatchRow | null>(null)
  const [saving, setSaving] = useState(false)

  const visible = filterMatches(rows, filters)
  const stats = matchAdminStats(rows)

  async function handleSaveResult(input: {
    patch: MatchResultPatch
    summary: string
    overwroteVerified: boolean
  }) {
    if (!resultRow) return
    setSaving(true)
    const result = await saveMatchResult({
      matchId: resultRow.id,
      patch: input.patch,
      summary: input.summary,
      confirmOverwriteVerified: input.overwroteVerified,
    })
    setSaving(false)
    toast({
      title: result.ok ? 'Result saved' : result.demo ? 'Nothing was saved' : 'Could not save',
      description: result.ok ? input.summary : result.message,
      variant: result.ok ? 'success' : result.demo ? 'warning' : 'danger',
    })
    if (result.ok || result.demo) setResultRow(null)
  }

  async function handleReschedule(input: {
    patch: ReschedulePatch
    summary: string
    conflicts: string[]
  }) {
    if (!moveRow) return
    setSaving(true)
    const result = await rescheduleMatch({
      matchId: moveRow.id,
      patch: input.patch,
      summary: input.summary,
      overrideConflicts: input.conflicts.length > 0,
      conflictSummary: input.conflicts,
    })
    setSaving(false)
    toast({
      title: result.ok ? 'Match moved' : result.demo ? 'Nothing was saved' : 'Could not move it',
      description: result.ok ? input.summary : result.message,
      variant: result.ok ? 'success' : result.demo ? 'warning' : 'danger',
    })
    if (result.ok || result.demo) setMoveRow(null)
  }

  return (
    <div>
      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Matches"
          value={stats.total}
          hint={stats.unplaced > 0 ? `${stats.unplaced} with no court yet` : 'All on the timetable'}
          icon={<ShuttlecockIcon size={20} />}
          tone="lilac"
        />
        <StatCard
          label="Decided"
          value={stats.decided}
          hint={`${stats.verified} scoresheet${stats.verified === 1 ? '' : 's'} verified`}
          icon={<TrophyIcon size={20} />}
          tone="mint"
        />
        <StatCard
          label="On court now"
          value={stats.live}
          hint={stats.live > 0 ? 'Being scored courtside' : 'Nothing in play'}
          icon={<RacketIcon size={20} />}
          tone="pink"
        />
        <StatCard
          label="Still to play"
          value={stats.scheduled}
          hint={stats.cancelled > 0 ? `${stats.cancelled} cancelled` : 'Nothing cancelled'}
          icon={<MedalIcon size={20} />}
          tone="sky"
        />
      </div>

      <MatchesFilterBar
        filters={filters}
        divisions={divisions}
        onChange={setFilters}
        resultCount={visible.length}
        totalCount={rows.length}
      />

      {visible.length === 0 ? (
        <EmptyState
          title="No matches match those filters"
          description="Nothing here — the shuttles are still warming up. Try widening the search. 🎄"
        />
      ) : (
        <MatchesTable rows={visible} onEditResult={setResultRow} onReschedule={setMoveRow} />
      )}

      <MatchesResultDialog
        row={resultRow}
        open={resultRow !== null}
        saving={saving}
        onClose={() => setResultRow(null)}
        onSave={handleSaveResult}
      />

      <MatchesRescheduleDialog
        row={moveRow}
        context={context}
        open={moveRow !== null}
        saving={saving}
        onClose={() => setMoveRow(null)}
        onSave={handleReschedule}
      />

      {isDemo && (
        <p className="mt-4 text-xs text-[var(--color-ink-soft)]">
          Demo mode: every dialog works and shows exactly what it would write, but nothing is saved.
        </p>
      )}
    </div>
  )
}

/** Wrapped in its own `ToastProvider` — the root layout has none. */
export function MatchesConsole(props: {
  rows: readonly AdminMatchRow[]
  divisions: readonly { id: string; name: string }[]
  context: RescheduleContextData
  isDemo: boolean
}) {
  return (
    <ToastProvider>
      <MatchesConsoleInner {...props} />
    </ToastProvider>
  )
}
