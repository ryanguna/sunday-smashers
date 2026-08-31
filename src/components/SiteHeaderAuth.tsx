'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/lib/useAuth'
import { cn } from '@/lib/cn'
import { accountDisplayName, accountLinks, accountNavState, type NavLink } from '@/components/site-nav'

/**
 * The account corner of `SiteHeader`: "My dashboard" + a sign-out control when
 * signed in, "Sign in" when signed out.
 *
 * Auth state comes from `useAuth()` (`src/lib/useAuth.ts`) — the hook the rest
 * of the client-side app already uses. Resolving the session here rather than in
 * a Server Component keeps every public page statically renderable: a
 * `supabase.auth.getUser()` in the root layout would read cookies and make the
 * whole site dynamic. The cost is that the server-rendered HTML can't know who
 * you are, so we render a working "My account" link until the session resolves
 * instead of a dead skeleton.
 *
 * Signing out POSTs to the existing `/auth/signout` route handler rather than
 * calling `supabase.auth.signOut()` again here — one sign-out implementation,
 * and it clears the server-side cookie too.
 */
export function SiteHeaderAuth({ variant }: { variant: 'desktop' | 'mobile' }) {
  const { user, profile, roles, loading, configured } = useAuth()
  const pathname = usePathname()
  const state = accountNavState({ configured, loading, signedIn: Boolean(user) })
  const mobile = variant === 'mobile'

  if (state === 'pending') {
    return (
      <AccountLink
        href="/dashboard"
        label="My account"
        mobile={mobile}
        active={pathname === '/dashboard'}
      />
    )
  }

  if (state === 'signed-out') {
    return (
      <AccountLink href="/login" label="Sign in" mobile={mobile} active={pathname === '/login'} />
    )
  }

  const links: NavLink[] = accountLinks(state === 'demo' ? [] : roles)
  const who = accountDisplayName(profile?.full_name, user?.email)

  const items = links.map((link, index) => (
    <AccountLink
      key={link.href}
      href={link.href}
      label={link.label}
      mobile={mobile}
      active={pathname === link.href}
      // The desktop row is already carrying nine primary links; the role
      // consoles only fit once there's room, and they stay in the mobile panel
      // (and on the dashboard) at every width.
      className={!mobile && index > 0 ? 'hidden 2xl:inline-flex' : undefined}
    />
  ))

  if (!mobile) {
    return (
      <>
        {items}
        {state === 'signed-in' && <SignOutButton mobile={false} who={who} />}
      </>
    )
  }

  return (
    <>
      {state === 'signed-in' && (
        <p className="px-4 pt-1 text-xs font-semibold text-[var(--color-ink-muted)]">
          Signed in as {who}
        </p>
      )}
      {items}
      {state === 'signed-in' && <SignOutButton mobile who={who} />}
    </>
  )
}

function AccountLink({
  href,
  label,
  mobile,
  active,
  className,
}: {
  href: string
  label: string
  mobile: boolean
  active: boolean
  className?: string
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
        className,
      )}
    >
      {label}
    </Link>
  )
}

/**
 * A plain form POST, so signing out works even before (or without) hydration,
 * and stays inside the mobile panel's focus order.
 */
function SignOutButton({ mobile, who }: { mobile: boolean; who: string }) {
  return (
    <form action="/auth/signout" method="post" className={mobile ? 'contents' : undefined}>
      <button
        type="submit"
        aria-label={`Sign out of ${who}`}
        className={cn(
          'font-semibold font-[family-name:var(--font-heading)] text-[var(--color-ink-soft)] transition-colors hover:bg-[var(--color-brand-lilac-light)]/50 hover:text-[var(--color-plum)]',
          mobile
            ? 'w-full rounded-[var(--radius-md)] px-4 py-2.5 text-left text-base'
            : 'rounded-[var(--radius-pill)] px-3 py-2 text-sm',
        )}
      >
        Sign out
      </button>
    </form>
  )
}
