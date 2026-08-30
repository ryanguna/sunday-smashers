'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useId, useRef, useState } from 'react'
import { Button } from '@/components/ui'
import { ShuttlecockIcon } from '@/components/icons'
import { cn } from '@/lib/cn'

const NAV_LINKS = [
  { href: '/', label: 'Home' },
  { href: '/rules', label: 'Rules' },
  { href: '/schedule', label: 'Schedule' },
  { href: '/standings', label: 'Standings' },
  { href: '/live', label: 'Live' },
  { href: '/players', label: 'Players' },
  { href: '/awards', label: 'Awards' },
  { href: '/gallery', label: 'Gallery' },
]

/**
 * Site-wide header: logo/wordmark, primary nav, a prominent Register CTA,
 * and a fully keyboard-accessible mobile hamburger menu (Escape to close,
 * focus-trapped while open, focus returns to the trigger on close).
 *
 * Nav links point at routes other agents are still building — that's
 * expected and fine; a missing route just 404s to the festive not-found
 * page rather than breaking this build.
 */
export function SiteHeader() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const menuId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  // Close the mobile menu whenever the route changes.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpen(false)
  }, [pathname])

  useEffect(() => {
    if (!open) return

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        setOpen(false)
        triggerRef.current?.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'
    // Move focus into the panel for keyboard users.
    const firstLink = panelRef.current?.querySelector<HTMLElement>('a, button')
    firstLink?.focus()

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = overflow
    }
  }, [open])

  return (
    <header className="sticky top-0 z-40 border-b border-white/60 bg-frost-glass">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link
          href="/"
          className="flex items-center gap-2 rounded-[var(--radius-md)] focus-visible:outline-offset-4"
        >
          <span
            aria-hidden="true"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-[image:var(--gradient-candy)] text-white shadow-[var(--shadow-glow-pink)]"
          >
            <ShuttlecockIcon size={20} />
          </span>
          <span className="flex flex-col leading-none">
            <span className="font-[family-name:var(--font-script)] text-xl text-[var(--color-brand-pink-dark)]">
              Sunday
            </span>
            <span className="font-[family-name:var(--font-heading)] text-sm font-extrabold tracking-wide text-[var(--color-plum)]">
              SMASHERS
            </span>
          </span>
        </Link>

        {/* Desktop nav */}
        <nav aria-label="Primary" className="hidden items-center gap-1 lg:flex">
          {NAV_LINKS.map((link) => {
            const active = pathname === link.href
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'rounded-[var(--radius-pill)] px-3.5 py-2 text-sm font-semibold font-[family-name:var(--font-heading)] transition-colors',
                  active
                    ? 'bg-[var(--color-brand-pink-light)] text-[var(--color-brand-pink-dark)]'
                    : 'text-[var(--color-ink-soft)] hover:bg-[var(--color-brand-lilac-light)]/50 hover:text-[var(--color-plum)]'
                )}
              >
                {link.label}
              </Link>
            )
          })}
        </nav>

        <div className="flex items-center gap-2">
          <Button href="/register" size="sm" className="hidden sm:inline-flex">
            Register
          </Button>

          {/* Mobile hamburger */}
          <button
            ref={triggerRef}
            type="button"
            aria-expanded={open}
            aria-controls={menuId}
            aria-label={open ? 'Close menu' : 'Open menu'}
            onClick={() => setOpen((v) => !v)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-[var(--radius-md)] text-[var(--color-plum)] hover:bg-[var(--color-brand-lilac-light)]/50 lg:hidden"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              {open ? (
                <path
                  d="M6 6l12 12M18 6L6 18"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                />
              ) : (
                <path
                  d="M4 6h16M4 12h16M4 18h16"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                />
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile menu panel */}
      {open && (
        <div
          className="fixed inset-0 top-[61px] z-30 bg-[var(--color-plum)]/30 backdrop-blur-sm lg:hidden"
          role="presentation"
          onClick={() => setOpen(false)}
        >
          <div
            id={menuId}
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label="Mobile navigation"
            className="animate-pop-in mx-4 mt-2 rounded-[var(--radius-lg)] bg-white p-3 shadow-[var(--shadow-lift)]"
            onClick={(e) => e.stopPropagation()}
          >
            <nav aria-label="Mobile primary" className="flex flex-col gap-1">
              {NAV_LINKS.map((link) => {
                const active = pathname === link.href
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'rounded-[var(--radius-md)] px-4 py-2.5 text-base font-semibold font-[family-name:var(--font-heading)]',
                      active
                        ? 'bg-[var(--color-brand-pink-light)] text-[var(--color-brand-pink-dark)]'
                        : 'text-[var(--color-ink-soft)] hover:bg-[var(--color-brand-lilac-light)]/50 hover:text-[var(--color-plum)]'
                    )}
                  >
                    {link.label}
                  </Link>
                )
              })}
              <Button href="/register" className="mt-2 justify-center">
                Register
              </Button>
            </nav>
          </div>
        </div>
      )}
    </header>
  )
}
