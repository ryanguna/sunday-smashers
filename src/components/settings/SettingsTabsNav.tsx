'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/cn'
import { SETTINGS_SECTIONS } from './sections'

/**
 * Horizontal, scrollable tab strip for the settings sub-routes. Uses real
 * links (not client-side tab state) so each section is bookmarkable, keeps
 * its own unsaved-changes scope, and is guarded server-side on its own.
 */
export function SettingsTabsNav() {
  const pathname = usePathname()

  return (
    <nav aria-label="Settings sections" className="-mx-1 overflow-x-auto px-1 pb-1">
      <ul className="flex min-w-max gap-2">
        {SETTINGS_SECTIONS.map((section) => {
          const Icon = section.icon
          const active =
            section.href === '/admin/settings'
              ? pathname === '/admin/settings' || pathname === '/admin/settings/'
              : pathname === section.href || pathname.startsWith(`${section.href}/`)

          return (
            <li key={section.href}>
              <Link
                href={section.href}
                aria-current={active ? 'page' : undefined}
                title={section.description}
                className={cn(
                  'inline-flex items-center gap-2 rounded-[var(--radius-pill)] px-4 py-2 text-sm font-semibold whitespace-nowrap transition',
                  'font-[family-name:var(--font-heading)]',
                  active
                    ? 'bg-[image:var(--gradient-candy)] text-white shadow-[var(--shadow-glow-pink)]'
                    : 'bg-white text-[var(--color-plum)] shadow-[var(--shadow-soft)] hover:bg-[var(--color-brand-lilac-light)]/50',
                )}
              >
                <Icon size={16} aria-hidden="true" />
                {section.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
