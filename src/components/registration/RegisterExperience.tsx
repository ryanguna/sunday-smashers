'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, Spinner } from '@/components/ui'
import { DemoModeNotice } from '@/components/auth'
import { GiftIcon } from '@/components/icons'
import { getRegistrationWindow, type RegistrationWindowInfo } from '@/lib/registration'
import type { SiteCopy } from '@/lib/site-copy'
import { loadRegistrationContext, type RegistrationContext } from './data'
import { RegistrationWizard } from './RegistrationWizard'
import { NoDivisionsPanel, NotOpenYetPanel, SignInPromptPanel, TournamentOverPanel } from './RegistrationStates'

/** Demo-only preview modes so every state of `/register` is reviewable. */
export type RegisterPreview = 'open' | 'closed' | 'full'

export interface RegisterExperienceProps {
  info: RegistrationWindowInfo
  /** Committee-editable disclaimers, loaded on the server. */
  copy: SiteCopy
  /** Only ever set in demo mode (no Supabase env vars) — see `page.tsx`. */
  preview?: RegisterPreview | null
}

/**
 * Client orchestrator for `/register`. Decides which of the five states the
 * player sees — waiting for the window, signed out, no divisions, the form
 * itself, or "the tournament already happened" — and then hands off to
 * `/register/success` once an entry is saved.
 */
export function RegisterExperience({ info, copy, preview = null }: RegisterExperienceProps) {
  const router = useRouter()
  const [context, setContext] = useState<RegistrationContext | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    loadRegistrationContext().then((loaded) => {
      if (cancelled) return
      setContext(loaded)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [])

  if (info.window === 'not-open-yet') {
    // Auth may still be resolving here — this branch runs before the `loading`
    // check below, so `signedIn` stays null until we actually know. Waiting for
    // the spinner instead would replace the whole "entries open on…" panel with
    // a loading state on every visit, which is a worse trade.
    const signedIn = loading ? null : Boolean(context?.userId)
    return <NotOpenYetPanel info={info} signedIn={signedIn} />
  }

  if (!info.acceptsSubmissions) {
    return <TournamentOverPanel info={info} />
  }

  if (loading || !context) {
    return (
      <Card variant="frosted" className="border-candy-stripe flex items-center justify-center gap-3 py-14">
        <Spinner size={26} />
        <p className="text-[var(--color-ink-soft)]">Warming up the shuttles…</p>
      </Card>
    )
  }

  if (context.configured && !context.userId) {
    return <SignInPromptPanel />
  }

  // Demo preview: fill the divisions so the waitlist path can be reviewed.
  const divisions =
    preview === 'full'
      ? context.divisions.map((division) => ({
          ...division,
          registeredPlayers: (division.maxTeams ?? 12) * 2,
        }))
      : context.divisions

  if (divisions.length === 0) {
    return <NoDivisionsPanel />
  }

  const formContext: RegistrationContext = { ...context, divisions }

  return (
    <div className="grid gap-5">
      {!context.configured && <DemoModeNotice what="Saving your registration" />}


      <RegistrationWizard
        context={formContext}
        copy={copy}
        window={info.window}
        onSubmitted={(result) => {
          const params = new URLSearchParams({ status: result.status })
          // Lets the confirmation page re-read the row that was actually
          // saved rather than believing `status` above.
          if (result.divisionId) params.set('divisionId', result.divisionId)
          const division = divisions.find((item) => item.id === result.divisionId)
          if (division) params.set('division', division.name)
          if (result.freeAgent) params.set('partner', 'solo')
          router.push(`/register/success?${params.toString()}`)
        }}
      />
    </div>
  )
}

/** Re-exported for the page so it can compute the window on the server. */
export { getRegistrationWindow }
