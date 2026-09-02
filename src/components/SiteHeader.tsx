'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '@/components/ui'
import { cn } from '@/lib/cn'
import { SiteHeaderAuth } from '@/components/SiteHeaderAuth'
import { useAuth } from '@/lib/useAuth'
import { accountNavState, NAV_LINKS, shouldShowRegisterCta } from '@/components/site-nav'
import { isPageVisible, visibleNavLinks, type SitePageVisibility } from '@/lib/site-pages'

/**
 * Site-wide header: logo/wordmark, primary nav, a prominent Register CTA,
 * the signed-in player's account controls (see `SiteHeaderAuth`), and a fully
 * keyboard-accessible mobile hamburger menu (Escape to close, focus-trapped
 * while open, focus returns to the trigger on close).
 *
 * The full nav collapses into the hamburger below `xl` rather than `lg`: the
 * primary list plus the account controls no longer fit on a 1024px row, and a
 * squashed desktop header is worse than one more tap.
 *
 * Nav links point at routes other agents are still building — that's
 * expected and fine; a missing route just 404s to the festive not-found
 * page rather than breaking this build.
 */
export function SiteHeader({ visibility }: { visibility?: SitePageVisibility }) {
  const pathname = usePathname()
  const { user, loading, configured } = useAuth()
  const [open, setOpen] = useState(false)

  // Both computed from the same two inputs so the desktop row, the mobile
  // panel and the CTA can never disagree about what exists.
  const navLinks = visibleNavLinks(NAV_LINKS, visibility)
  const showRegister = shouldShowRegisterCta({
    accountState: accountNavState({ configured, loading, signedIn: Boolean(user) }),
    registerPageVisible: isPageVisible(visibility, 'register'),
  })
  const menuId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const headerRef = useRef<HTMLElement>(null)

  /**
   * How far down the screen the menu overlay starts, in pixels.
   *
   * This used to be a hardcoded `top-[61px]`, which was already wrong — the
   * logo grows from `h-10` to `h-11` at `sm`, so the real header is 65px on a
   * small phone and 69px on a large one, and the overlay covered part of it.
   * Measuring is the only way to stay correct as the header's contents change.
   */
  const [headerHeight, setHeaderHeight] = useState(61)

  /**
   * `createPortal` needs a real `document`, which does not exist during the
   * server render. Rendering the panel only after mount is safe because the
   * menu can only be opened by a click, which already implies a mounted client.
   */
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true)
  }, [])

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
    // Measure the header now rather than on every render: it cannot change
    // height while the menu is open, and reading `offsetHeight` forces layout.
    const measure = () => {
      const height = headerRef.current?.offsetHeight
      if (height) setHeaderHeight(height)
    }
    measure()
    window.addEventListener('resize', measure)
    // Move focus into the panel for keyboard users.
    const firstLink = panelRef.current?.querySelector<HTMLElement>('a, button')
    firstLink?.focus()

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('resize', measure)
      document.body.style.overflow = overflow
    }
  }, [open])

  /**
   * The mobile menu, rendered into `document.body` rather than into the header.
   *
   * This is not a preference — it is the fix for a real iOS bug. The header
   * carries `bg-frost-glass`, which sets `backdrop-filter`, and per spec that
   * makes the header a **containing block for `position: fixed` descendants**
   * (the same rule `filter` and `transform` follow). Rendered inside the
   * header, the panel's `fixed inset-0` therefore resolved against the ~65px
   * header strip instead of the viewport, so on an iPhone the menu appeared
   * behind the page content instead of over it.
   *
   * `backdrop-filter` also makes the header its own stacking context, which
   * separately capped the panel's `z-index` at the header's own `z-40`.
   * Portalling to `document.body` escapes both traps at once: the overlay is
   * measured against the viewport and its `z-50` is compared against the page,
   * so it sits above the header while staying below toasts (`z-100`) and
   * confetti (`z-90`), which must remain visible over any open menu.
   *
   * React still owns this subtree, so state, context and event bubbling all
   * work exactly as before — only the DOM parent changes.
   */
  const menu =
    open && mounted
      ? createPortal(
          <div
            className="fixed inset-0 z-50 overflow-y-auto bg-[var(--color-plum)]/30 backdrop-blur-sm xl:hidden"
            style={{ top: headerHeight }}
            role="presentation"
            onClick={() => setOpen(false)}
          >
            <div
              id={menuId}
              ref={panelRef}
              role="dialog"
              aria-modal="true"
              aria-label="Mobile navigation"
              className="animate-pop-in mx-4 mt-2 mb-6 rounded-[var(--radius-lg)] bg-white p-3 shadow-[var(--shadow-lift)]"
              onClick={(e) => e.stopPropagation()}
            >
              <nav aria-label="Mobile primary" className="flex flex-col gap-1">
                {navLinks.map((link) => {
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
                {showRegister && (
                  <Button href="/register" className="mt-2 justify-center">
                    Register
                  </Button>
                )}

                <div
                  role="separator"
                  aria-hidden="true"
                  className="my-2 h-px bg-[var(--color-brand-lilac-light)]"
                />

                {/* Account controls — the reason a player can reach their own
                    dashboard from a phone at all. Rendered last so the focus
                    move-in on open still lands on "Home". */}
                <SiteHeaderAuth variant="mobile" />
              </nav>
            </div>
          </div>,
          document.body
        )
      : null

  return (
    <header
      ref={headerRef}
      className="sticky top-0 z-40 border-b border-white/60 bg-frost-glass"
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link
          href="/"
          className="flex items-center gap-2 rounded-[var(--radius-md)] focus-visible:outline-offset-4"
        >
          {/* The real wordmark, not a CSS approximation of it. `priority`
              because it sits in the header on every page, so it is always in
              the initial viewport and would otherwise cause a visible pop. The
              alt text is on the link's label below, so the image is decorative
              here and must not repeat it to a screen reader. */}
          <Image
            src="/brand/logo-secondary.png"
            alt=""
            width={369}
            height={167}
            priority
            className="h-10 w-auto sm:h-11"
          />
          <span className="sr-only">Sunday Smashers — home</span>
        </Link>

        {/* Desktop nav */}
        <nav aria-label="Primary" className="hidden items-center gap-0.5 xl:flex">
          {navLinks.map((link) => {
            const active = pathname === link.href
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'rounded-[var(--radius-pill)] px-2.5 py-2 text-sm font-semibold font-[family-name:var(--font-heading)] transition-colors',
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

        <div className="flex items-center gap-1">
          {/* Account controls: desktop only — the mobile panel renders its own. */}
          <div className="hidden items-center gap-0.5 xl:flex">
            <SiteHeaderAuth variant="desktop" />
          </div>

          {showRegister && (
            <Button href="/register" size="sm" className="ml-1 hidden sm:inline-flex">
              Register
            </Button>
          )}

          {/* Mobile hamburger */}
          <button
            ref={triggerRef}
            type="button"
            aria-expanded={open}
            aria-controls={menuId}
            aria-label={open ? 'Close menu' : 'Open menu'}
            onClick={() => setOpen((v) => !v)}
            className="ml-1 inline-flex h-10 w-10 items-center justify-center rounded-[var(--radius-md)] text-[var(--color-plum)] hover:bg-[var(--color-brand-lilac-light)]/50 xl:hidden"
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

      {menu}
    </header>
  )
}
