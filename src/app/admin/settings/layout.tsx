import type { ReactNode } from 'react'
import type { Metadata } from 'next'
import { GradientText } from '@/components/ui'
import { BaubleIcon, HollyIcon } from '@/components/icons'
import { SettingsTabsNav } from '@/components/settings'

export const metadata: Metadata = {
  title: 'Tournament settings',
  description: 'Admin console for tournament details, divisions, rules, courts, roles and prizes.',
}

/**
 * Frame for every `/admin/settings/*` screen: festive header + the tab strip.
 *
 * This layout deliberately does NOT authorise anything — each page guards
 * itself with `requireAdmin()` so a new sub-route can never be added
 * unprotected by accident. It nests inside the admin console shell
 * (`src/app/admin/layout.tsx`, owned by another agent) when that exists.
 */
export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
      <header className="mb-6">
        <p className="flex items-center gap-2 text-sm font-semibold text-[var(--color-brand-pink-dark)]">
          <HollyIcon size={18} aria-hidden="true" />
          Admin console
        </p>
        <h1 className="mt-1 flex items-center gap-3 text-3xl font-bold sm:text-4xl">
          <BaubleIcon size={32} aria-hidden="true" className="text-[var(--color-brand-lilac-dark)]" />
          <GradientText as="span">Tournament settings</GradientText>
        </h1>
        <p className="mt-2 max-w-2xl text-[var(--color-ink-soft)]">
          The rules are still a draft — everything here is editable, validated, and logged. Change it
          before the draw goes out and nobody has to replay a single rally.
        </p>
      </header>

      <div className="mb-6">
        <SettingsTabsNav />
      </div>

      {children}
    </div>
  )
}
