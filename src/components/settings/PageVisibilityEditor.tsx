'use client'

import { useCallback, useMemo } from 'react'
import { Badge } from '@/components/ui'
import { SnowflakeIcon } from '@/components/icons'
import { SettingsCard } from './Chrome'
import { SaveBar } from './SaveBar'
import { useSettingsDraft, type DraftSaveResult } from './useSettingsDraft'
import {
  completeVisibility,
  diffSitePageVisibility,
  SITE_PAGES,
  SITE_PAGE_PHASES,
  type SitePage,
  type SitePageKey,
  type SitePageVisibility,
} from '@/lib/site-pages'

/**
 * Reveal-as-you-go switches for the public pages.
 *
 * Grouped by tournament phase rather than listed alphabetically, because the
 * question the committee is actually asking is "what should be on right now?",
 * and the answer moves through the phases in order.
 *
 * Deliberately *not* dressed up as access control: the copy says "hidden"
 * everywhere, never "private". Anything genuinely sensitive is protected by
 * RLS and the `/admin` guard, not by these switches.
 */

export interface PageVisibilityEditorProps {
  initial: SitePageVisibility
  save: (draft: SitePageVisibility) => Promise<DraftSaveResult>
  disabled?: boolean
}

export function PageVisibilityEditor({ initial, save, disabled }: PageVisibilityEditorProps) {
  // Normalising up front means every switch is explicitly on or off. Left as a
  // sparse map, a page nobody has ever configured would diff as unchanged no
  // matter which way it was toggled and back.
  const normalised = useMemo(() => completeVisibility(initial), [initial])

  const validate = useCallback(() => [], [])
  const draftState = useSettingsDraft<Record<SitePageKey, boolean>>({
    initial: normalised,
    validate,
    diff: diffSitePageVisibility,
    save,
  })

  const { draft, setDraft } = draftState
  const hiddenCount = SITE_PAGES.filter((page) => !draft[page.key]).length

  const setAll = (phase: SitePage['phase'], visible: boolean) => {
    setDraft((current) => {
      const next = { ...current }
      for (const page of SITE_PAGES) if (page.phase === phase) next[page.key] = visible
      return next
    })
  }

  return (
    <div className="space-y-5">
      <SettingsCard
        title="What the site shows"
        tone="sky"
        icon={<SnowflakeIcon size={18} aria-hidden="true" />}
        description="Unwrap each page when it has something in it. Hidden pages still exist — visitors get a friendly “not open yet” note instead, and organisers can still preview them."
        meta={
          <Badge status={hiddenCount === 0 ? 'approved' : 'pending'}>
            {hiddenCount === 0
              ? 'Everything showing'
              : `${hiddenCount} hidden`}
          </Badge>
        }
      >
        <div className="space-y-6">
          {SITE_PAGE_PHASES.map((group) => {
            const pages = SITE_PAGES.filter((page) => page.phase === group.phase)
            if (pages.length === 0) return null
            const allOn = pages.every((page) => draft[page.key])

            return (
              <section key={group.phase}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div>
                    <h3 className="font-[family-name:var(--font-heading)] font-bold text-[var(--color-plum)]">
                      {group.label}
                    </h3>
                    <p className="text-sm text-[var(--color-ink-muted)]">{group.blurb}</p>
                  </div>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => setAll(group.phase, !allOn)}
                    className="rounded-[var(--radius-pill)] px-3 py-1 text-xs font-semibold text-[var(--color-brand-pink-dark)] underline-offset-2 hover:underline disabled:opacity-50"
                  >
                    {allOn ? 'Hide all' : 'Show all'}
                  </button>
                </div>

                <ul className="mt-3 space-y-2">
                  {pages.map((page) => (
                    <li key={page.key}>
                      <PageToggle
                        page={page}
                        checked={draft[page.key]}
                        disabled={disabled}
                        onChange={(visible) =>
                          setDraft((current) => ({ ...current, [page.key]: visible }))
                        }
                      />
                    </li>
                  ))}
                </ul>
              </section>
            )
          })}
        </div>
      </SettingsCard>

      <SaveBar
        dirty={draftState.dirty}
        saving={draftState.saving}
        canSave={draftState.canSave}
        changes={draftState.changes}
        result={draftState.result}
        celebrate={draftState.celebrate}
        onSave={draftState.submit}
        onReset={draftState.reset}
      />
    </div>
  )
}

function PageToggle({
  page,
  checked,
  disabled,
  onChange,
}: {
  page: SitePage
  checked: boolean
  disabled?: boolean
  onChange: (visible: boolean) => void
}) {
  return (
    <label
      className={[
        'flex cursor-pointer items-start gap-3 rounded-[var(--radius-md)] border p-3 transition',
        checked
          ? 'border-[var(--color-brand-mint)]/50 bg-[var(--color-brand-mint-light)]/30'
          : 'border-black/5 bg-[var(--color-frost-100)]',
      ].join(' ')}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--color-brand-pink-dark)]"
      />
      <span className="min-w-0 text-sm">
        <span className="flex flex-wrap items-baseline gap-x-2">
          <span className="font-semibold text-[var(--color-plum)]">{page.label}</span>
          <code className="text-xs text-[var(--color-ink-muted)]">{page.href}</code>
          {!checked && (
            <span className="text-xs font-semibold text-[var(--color-warn)]">Hidden</span>
          )}
        </span>
        <span className="mt-0.5 block text-[var(--color-ink-soft)]">{page.description}</span>
      </span>
    </label>
  )
}
