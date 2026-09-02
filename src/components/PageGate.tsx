import type { ReactNode } from 'react'
import Link from 'next/link'
import { Button, Card } from '@/components/ui'
import { SnowflakeIcon } from '@/components/icons'
import { isAdmin, isDemoMode } from '@/lib/auth'
import { loadSitePageVisibility } from '@/lib/site-pages-server'
import { isPageVisible, sitePageByKey, type SitePageKey } from '@/lib/site-pages'

/**
 * Wraps a public page so the committee can keep it hidden until it's ready.
 *
 * ## How to use it
 *
 * Wrap the page's own `<main>` content:
 *
 * ```tsx
 * export default async function StandingsPage() {
 *   return <PageGate pageKey="standings">{…}</PageGate>
 * }
 * ```
 *
 * ## Why the visibility check comes first
 *
 * The order of the two lookups in here is load-bearing. `loadSitePageVisibility`
 * is cached and reads no cookies, so a **visible** page never touches the
 * request — which is what lets the route stay statically renderable and keeps
 * navigation instant. The admin check does read cookies, and would make the
 * route dynamic, so it is deliberately reached only on the hidden branch. A
 * hidden page is rendering a placeholder anyway, so paying for a dynamic render
 * there costs nothing.
 *
 * Do not "tidy" this by hoisting the admin check to the top.
 *
 * ## Why admins see through it
 *
 * Otherwise the committee cannot check a page before revealing it — they would
 * have to switch it on for the whole world in order to look at it, which is the
 * opposite of the point. Admins get the real page plus a banner reminding them
 * nobody else can see it.
 *
 * ## What this is not
 *
 * Not access control. Hiding a page swaps its contents for a friendly panel;
 * it does not protect the underlying rows, which have their own RLS policies.
 * See `src/lib/site-pages.ts`.
 */
export async function PageGate({
  pageKey,
  children,
}: {
  pageKey: SitePageKey
  children: ReactNode
}) {
  const visibility = await loadSitePageVisibility()

  if (isPageVisible(visibility, pageKey)) {
    return <>{children}</>
  }

  // Demo mode has no auth system at all, and its whole purpose is that every
  // page is browsable with no setup — so it sees through the gate too.
  if (isDemoMode() || (await isAdmin())) {
    return (
      <>
        <PreviewBanner pageKey={pageKey} />
        {children}
      </>
    )
  }

  return <HiddenPagePanel pageKey={pageKey} />
}

function PreviewBanner({ pageKey }: { pageKey: SitePageKey }) {
  const page = sitePageByKey(pageKey)
  return (
    <div className="border-b border-[var(--color-warn)]/30 bg-[var(--color-warn-bg)]">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 sm:px-6">
        <p className="text-sm font-semibold text-[var(--color-warn)]">
          Organiser preview — “{page?.label ?? pageKey}” is hidden from everyone else.
        </p>
        <Link
          href="/admin/settings/pages"
          className="text-sm font-bold text-[var(--color-warn)] underline hover:no-underline"
        >
          Change what’s visible
        </Link>
      </div>
    </div>
  )
}

/**
 * What an ordinary visitor gets instead of the page.
 *
 * Deliberately not a 404. Links to these pages get posted in the group chat
 * long before the pages have anything on them, and "page not found" reads as
 * "the site is broken" rather than "not yet". Every catalogue entry carries its
 * own copy so the explanation is specific — "the draw hasn't been made yet"
 * rather than a generic shrug.
 */
function HiddenPagePanel({ pageKey }: { pageKey: SitePageKey }) {
  const page = sitePageByKey(pageKey)
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-16 sm:px-6">
      <Card variant="frosted" className="border-candy-stripe text-center">
        <span
          aria-hidden="true"
          className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[image:var(--gradient-mint-sky)] text-white shadow-[var(--shadow-soft)]"
        >
          <SnowflakeIcon size={28} />
        </span>
        <h1 className="text-2xl font-bold text-[var(--color-plum)]">
          {page?.hiddenTitle ?? 'Not open yet'}
        </h1>
        <p className="mx-auto mt-3 max-w-md text-[var(--color-ink-soft)]">
          {page?.hiddenMessage ??
            'The committee hasn’t opened this part of the site yet. Check back soon 🎄'}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Button href="/">Back to the front page</Button>
          <Button href="/announcements" variant="secondary">
            Read the announcements
          </Button>
        </div>
      </Card>
    </main>
  )
}
