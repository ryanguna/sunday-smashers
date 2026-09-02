'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useId, useRef, useState } from 'react'
import { useAuth } from '@/lib/useAuth'
import { cn } from '@/lib/cn'
import { accountDisplayName, accountLinks, accountNavState, type NavLink } from '@/components/site-nav'

/**
 * The account corner of `SiteHeader`.
 *
 * ## Why an avatar menu instead of a row of links
 *
 * This used to render "My dashboard", every role console the player held, and
 * a "Sign out" button as separate items on the header row — beside nine
 * primary nav links and a Register button. There was no room, so the role
 * consoles were hidden below `2xl` and a signed-in organiser on a laptop
 * simply could not see the link to the admin console. Collapsing all of it
 * behind one avatar button gives every account action a single, predictable
 * home at every width, and frees the header row for actual navigation.
 *
 * ## Why the session is resolved on the client
 *
 * Auth state comes from `useAuth()`. Resolving it in a Server Component would
 * mean the root layout reads cookies, which makes **every** route dynamic and
 * uncacheable — the thing that made navigation feel stuck. The cost is that
 * server-rendered HTML can't know who you are, so until the session resolves
 * we render a neutral, working "Account" link rather than a dead skeleton or a
 * "Sign in" button that would visibly flip to an avatar a moment later.
 */
export function SiteHeaderAuth({ variant }: { variant: 'desktop' | 'mobile' }) {
  const { user, profile, roles, loading, configured } = useAuth()
  const pathname = usePathname()
  const state = accountNavState({ configured, loading, signedIn: Boolean(user) })
  const mobile = variant === 'mobile'

  if (state === 'signed-out') {
    return <AccountLink href="/login" label="Sign in" mobile={mobile} active={pathname === '/login'} />
  }

  if (state === 'pending') {
    // Neutral wording: we genuinely don't know yet whether there's a session,
    // and guessing wrong produces a control that changes under the cursor.
    return <AccountLink href="/dashboard" label="Account" mobile={mobile} active={false} />
  }

  const links = accountLinks(state === 'demo' ? [] : roles)
  const who = accountDisplayName(profile?.full_name, user?.email)

  if (mobile) {
    return (
      <>
        {state === 'signed-in' && (
          <p className="px-4 pt-1 text-xs font-semibold text-[var(--color-ink-muted)]">
            Signed in as {who}
          </p>
        )}
        {links.map((link) => (
          <AccountLink
            key={link.href}
            href={link.href}
            label={link.label}
            mobile
            active={pathname === link.href}
          />
        ))}
        {state === 'signed-in' && <SignOutButton mobile who={who} />}
      </>
    )
  }

  return (
    <AccountMenu
      who={who}
      avatarUrl={profile?.avatar_url ?? null}
      links={links}
      pathname={pathname}
      showSignOut={state === 'signed-in'}
    />
  )
}

/**
 * The desktop avatar button and its dropdown.
 *
 * Kept deliberately plain: a `<button aria-expanded aria-haspopup="menu">`
 * controlling a `role="menu"` list. Closes on Escape (returning focus to the
 * trigger), on outside click, and whenever the route changes — the last one
 * matters because the menu's own links navigate, and a panel left hanging open
 * over the new page is the classic version of this bug.
 */
function AccountMenu({
  who,
  avatarUrl,
  links,
  pathname,
  showSignOut,
}: {
  who: string
  avatarUrl: string | null
  links: NavLink[]
  pathname: string
  showSignOut: boolean
}) {
  const [open, setOpen] = useState(false)
  const menuId = useId()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

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

    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false)
    }

    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('mousedown', handlePointerDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('mousedown', handlePointerDown)
    }
  }, [open])

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={open ? menuId : undefined}
        aria-label={`Account menu for ${who}`}
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-1.5 rounded-[var(--radius-pill)] p-1 transition-colors hover:bg-[var(--color-brand-lilac-light)]/50"
      >
        <Avatar who={who} avatarUrl={avatarUrl} />
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
          className="text-[var(--color-ink-muted)]"
        >
          <path
            d="M6 9l6 6 6-6"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label="Account"
          className="animate-pop-in absolute right-0 z-50 mt-2 w-60 rounded-[var(--radius-lg)] bg-white p-2 shadow-[var(--shadow-lift)]"
        >
          <p className="truncate px-3 py-2 text-xs font-semibold text-[var(--color-ink-muted)]">
            Signed in as <span className="text-[var(--color-plum)]">{who}</span>
          </p>
          <div
            role="separator"
            aria-hidden="true"
            className="mx-1 my-1 h-px bg-[var(--color-brand-lilac-light)]"
          />
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              role="menuitem"
              aria-current={pathname === link.href ? 'page' : undefined}
              className={cn(
                'block rounded-[var(--radius-md)] px-3 py-2 text-sm font-semibold font-[family-name:var(--font-heading)] transition-colors',
                pathname === link.href
                  ? 'bg-[var(--color-brand-pink-light)] text-[var(--color-brand-pink-dark)]'
                  : 'text-[var(--color-ink-soft)] hover:bg-[var(--color-brand-lilac-light)]/50 hover:text-[var(--color-plum)]',
              )}
            >
              {link.label}
            </Link>
          ))}
          {showSignOut && (
            <>
              <div
                role="separator"
                aria-hidden="true"
                className="mx-1 my-1 h-px bg-[var(--color-brand-lilac-light)]"
              />
              <SignOutButton mobile={false} who={who} />
            </>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * The player's photo, or their initials on a candy gradient.
 *
 * A plain `<img>` rather than `next/image`: avatar URLs are arbitrary
 * player-supplied links, and the optimiser rejects hosts that aren't listed in
 * `next.config.ts`, which would break the avatar for anyone using a host the
 * committee hadn't predicted.
 */
function Avatar({ who, avatarUrl }: { who: string; avatarUrl: string | null }) {
  return (
    <span
      aria-hidden="true"
      className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[image:var(--gradient-candy)] text-xs font-bold text-[var(--color-plum)] shadow-[var(--shadow-glow-pink)]"
    >
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        initialsFrom(who)
      )}
    </span>
  )
}

/** Up to two initials, falling back to a shuttlecock for an unnameable account. */
export function initialsFrom(name: string): string {
  const letters = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
  return letters || '🏸'
}

function AccountLink({
  href,
  label,
  mobile,
  active,
}: {
  href: string
  label: string
  mobile: boolean
  active: boolean
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'font-semibold font-[family-name:var(--font-heading)] transition-colors',
        mobile
          ? 'rounded-[var(--radius-md)] px-4 py-2.5 text-base'
          : 'rounded-[var(--radius-pill)] px-3 py-2 text-sm',
        active
          ? 'bg-[var(--color-brand-pink-light)] text-[var(--color-brand-pink-dark)]'
          : 'text-[var(--color-ink-soft)] hover:bg-[var(--color-brand-lilac-light)]/50 hover:text-[var(--color-plum)]',
      )}
    >
      {label}
    </Link>
  )
}

/**
 * A plain form POST, so signing out works even before (or without) hydration,
 * and stays inside the menu's focus order.
 */
function SignOutButton({ mobile, who }: { mobile: boolean; who: string }) {
  return (
    <form action="/auth/signout" method="post" className={mobile ? 'contents' : undefined}>
      <button
        type="submit"
        role={mobile ? undefined : 'menuitem'}
        aria-label={`Sign out of ${who}`}
        className={cn(
          'font-semibold font-[family-name:var(--font-heading)] text-[var(--color-ink-soft)] transition-colors hover:bg-[var(--color-brand-lilac-light)]/50 hover:text-[var(--color-plum)]',
          mobile
            ? 'w-full rounded-[var(--radius-md)] px-4 py-2.5 text-left text-base'
            : 'block w-full rounded-[var(--radius-md)] px-3 py-2 text-left text-sm',
        )}
      >
        Sign out
      </button>
    </form>
  )
}
