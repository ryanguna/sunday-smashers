import type { Metadata } from 'next'

import { requireAdmin } from '@/lib/auth'
import { isSupabaseConfigured } from '@/lib/supabase/config'
import { ChecklistPrintView } from '@/components/checklist'
import { TOURNAMENT_DATE_LABEL } from '@/lib/tournament'
import { getChecklistPageData } from '../data'

export const metadata: Metadata = {
  title: 'Checklist (print) · Admin',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

/** The paper version. Plain black-on-white, real tick boxes, no animation. */
export default async function AdminChecklistPrintPage() {
  if (isSupabaseConfigured()) {
    await requireAdmin('/admin/checklist/print')
  }

  const { items, derived, nowIso } = await getChecklistPageData()

  return (
    <div className="bg-white">
      {/*
        The admin shell (sidebar, site header, footer) is rendered by a
        parent layout this route cannot edit, so it is isolated away at print
        time rather than wasting the committee's paper.
      */}
      <style>{`@media print {
  body :not(#venue-checklist):not(#venue-checklist *) { visibility: hidden !important; }
  #venue-checklist, #venue-checklist * { visibility: visible !important; }
  #venue-checklist { position: absolute; inset: 0 auto auto 0; width: 100%; }
}`}</style>
      <p className="mx-auto max-w-3xl px-6 pt-4 text-sm text-[var(--color-ink-soft)] print:hidden">
        Press <kbd className="rounded border px-1">⌘/Ctrl</kbd> +{' '}
        <kbd className="rounded border px-1">P</kbd> to print this, then take it to the venue.
      </p>
      <div id="venue-checklist">
        <ChecklistPrintView
          items={items}
          derived={derived}
          nowIso={nowIso}
          dateLabel={TOURNAMENT_DATE_LABEL}
        />
      </div>
    </div>
  )
}
