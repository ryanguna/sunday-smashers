import type { Metadata } from 'next'
import { requireAdmin } from '@/lib/auth'
import { ToastProvider } from '@/components/ui'
import { GalleryModeration } from '@/components/gallery'

export const metadata: Metadata = {
  title: 'Gallery · Admin',
  robots: { index: false, follow: false },
}

// Reads cookies (auth) — never prerender.
export const dynamic = 'force-dynamic'

/**
 * Photo moderation. Uploads are pending until approved here, so this is the
 * gate between "a player pressed upload" and "it's on the public gallery".
 *
 * Wrapped in its own `ToastProvider` so the page works whether or not the
 * shared admin shell provides one.
 */
export default async function AdminGalleryPage() {
  await requireAdmin('/admin/gallery')

  return (
    <ToastProvider>
      <div className="space-y-6">
        <header>
          <p className="font-[family-name:var(--font-script)] text-2xl text-[var(--color-brand-pink-dark)]">
            The photo shoebox
          </p>
          <h1 className="text-3xl font-extrabold text-[var(--color-plum)]">Gallery moderation</h1>
          <p className="mt-2 max-w-2xl text-[var(--color-ink-soft)]">
            Approve the keepers, set aside the blurry ceiling shots, and star a few favourites to
            feature on the home page.
          </p>
        </header>
        <GalleryModeration />
      </div>
    </ToastProvider>
  )
}
