'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState, type ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { ToastProvider } from '@/components/ui'
import { HollyIcon, ShuttlecockIcon, SparkleIcon } from '@/components/icons'
import { adminNavByGroup, findAdminNavItem, isAdminNavItemActive, type AdminNavItem } from './nav'

/**
 * The admin console chrome: a festive sticky sidebar on desktop and a
 * slide-in drawer on mobile (admins run this from the sidelines on a
 * phone), plus the shared `ToastProvider` every admin page writes to.
 *
 * The nav itself comes entirely from `./nav.ts` — add a section there and
 * it shows up in both layouts automatically.
 */

function NavLink({
  item,
  active,
  onNavigate,
}: {
  item: AdminNavItem
  active: boolean
  onNavigate?: () => void
}) {
  const Icon = item.icon
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      title={item.description}
      className={cn(
        'group flex items-center gap-2.5 rounded-[var(--radius-pill)] px-3 py-2 text-sm font-semibold font-[family-name:var(--font-heading)] transition-colors',
        active
          ? 'bg-[image:var(--gradient-candy)] text-[var(--color-plum)] shadow-[var(--shadow-glow-pink)]'
          : 'text-[var(--color-ink-soft)] hover:bg-[var(--color-brand-lilac-light)]/60 hover:text-[var(--color-plum)]',
      )}
    >
      <Icon
        size={18}
        className={cn('shrink-0', active ? 'text-white' : 'text-[var(--color-brand-lilac-dark)]')}
      />
      <span className="truncate">{item.label}</span>
    </Link>
  )
}

function NavSections({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <nav aria-label="Admin sections" className="flex flex-col gap-5">
      {adminNavByGroup().map((section) => (
        <div key={section.group}>
          <p className="mb-1.5 px-3 text-[0.68rem] font-bold uppercase tracking-[0.14em] text-[var(--color-ink-muted)]">
            {section.group}
          </p>
          <div className="flex flex-col gap-1">
            {section.items.map((item) => (
              <NavLink
                key={item.href}
                item={item}
                active={isAdminNavItemActive(item, pathname)}
                onNavigate={onNavigate}
              />
            ))}
          </div>
        </div>
      ))}
    </nav>
  )
}

function SidebarBrand() {
  return (
    <div className="mb-5 flex items-center gap-2.5 rounded-[var(--radius-md)] bg-[image:var(--gradient-mint-sky)] px-3 py-2.5 text-white shadow-[var(--shadow-glow-mint)]">
      <ShuttlecockIcon size={22} className="animate-bob [animation-duration:4s]" />
      <div className="leading-tight">
        <p className="font-[family-name:var(--font-heading)] text-sm font-extrabold">
          Admin console
        </p>
        <p className="text-[0.7rem] opacity-90">Sunday Smashers HQ</p>
      </div>
    </div>
  )
}

export function AdminShell({ children, demo = false }: { children: ReactNode; demo?: boolean }) {
  const pathname = usePathname() ?? '/admin'
  const [drawerOpen, setDrawerOpen] = useState(false)
  const current = findAdminNavItem(pathname)

  useEffect(() => {
    if (!drawerOpen) return
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setDrawerOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [drawerOpen])

  return (
    <ToastProvider>
      <div className="mx-auto w-full max-w-[1500px] px-3 pb-16 pt-4 sm:px-5 lg:px-8">
        {/* Mobile bar */}
        <div className="mb-4 flex items-center gap-3 rounded-[var(--radius-lg)] bg-frost-glass px-3.5 py-3 shadow-[var(--shadow-soft)] lg:hidden">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-expanded={drawerOpen}
            aria-controls="admin-drawer"
            className="flex items-center gap-2 rounded-[var(--radius-pill)] bg-[image:var(--gradient-candy)] px-3.5 py-2 text-sm font-bold text-[var(--color-plum)] shadow-[var(--shadow-glow-pink)]"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M4 7h16M4 12h16M4 17h16"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
              />
            </svg>
            Sections
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate font-[family-name:var(--font-heading)] font-bold text-[var(--color-plum)]">
              {current?.label ?? 'Admin'}
            </p>
          </div>
          <HollyIcon size={22} className="shrink-0 text-[var(--color-brand-holly)]" />
        </div>

        <div className="flex gap-6">
          {/* Desktop sidebar */}
          <aside className="hidden w-[15.5rem] shrink-0 lg:block">
            <div className="sticky top-6 rounded-[var(--radius-lg)] bg-frost-glass p-3.5 shadow-[var(--shadow-soft)]">
              <SidebarBrand />
              <NavSections pathname={pathname} />
              {demo && (
                <p className="mt-5 rounded-[var(--radius-md)] bg-[var(--color-info-bg)] px-3 py-2 text-[0.72rem] font-semibold text-[var(--color-info)]">
                  <SparkleIcon size={14} className="mr-1 inline align-[-2px]" />
                  Demo data — no database connected.
                </p>
              )}
            </div>
          </aside>

          <main className="min-w-0 flex-1">{children}</main>
        </div>
      </div>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close admin navigation"
            onClick={() => setDrawerOpen(false)}
            className="absolute inset-0 bg-[var(--color-plum)]/45 backdrop-blur-sm"
          />
          <div
            id="admin-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Admin sections"
            className="absolute inset-y-0 left-0 w-[17rem] max-w-[85vw] overflow-y-auto bg-[var(--color-frost)] p-4 shadow-[var(--shadow-lift)] animate-fade-in"
          >
            <div className="mb-4 flex items-center justify-between gap-2">
              <SidebarBrand />
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                aria-label="Close"
                className="mb-5 shrink-0 rounded-full bg-white p-2 text-[var(--color-plum)] shadow-[var(--shadow-soft)]"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path
                    d="M6 6l12 12M18 6L6 18"
                    stroke="currentColor"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>
            <NavSections pathname={pathname} onNavigate={() => setDrawerOpen(false)} />
          </div>
        </div>
      )}
    </ToastProvider>
  )
}
