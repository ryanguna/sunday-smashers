import Link from 'next/link'
import { cn } from '@/lib/cn'
import { SparkleIcon } from '@/components/icons'
import { altTextFor, featuredPhotos, polaroidTilt } from '@/lib/gallery'
import { loadGalleryPage } from './data'
import { PhotoImage } from './PhotoImage'

/**
 * Embeddable highlights strip — a row of pegged polaroids other pages
 * (notably the landing page) can drop in with no props:
 *
 * ```tsx
 * import { FeaturedPhotoStrip } from '@/components/gallery'
 * // …
 * <FeaturedPhotoStrip limit={6} />
 * ```
 *
 * It's an async Server Component that fetches approved photos itself (via
 * the anonymous browser client — no `next/headers`), and renders the festive
 * demo artwork when Supabase isn't configured, so it is always safe to
 * render and never blank.
 */
export interface FeaturedPhotoStripProps {
  limit?: number
  className?: string
  /** Set false to drop the "See the whole gallery" link. */
  showLink?: boolean
}

export async function FeaturedPhotoStrip({
  limit = 6,
  className,
  showLink = true,
}: FeaturedPhotoStripProps) {
  const { photos } = await loadGalleryPage()
  const picks = featuredPhotos(photos, limit)

  if (picks.length === 0) return null

  return (
    <div className={cn('w-full', className)}>
      <ul className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-4 pt-2 [scrollbar-width:thin]">
        {picks.map((photo) => (
          <li
            key={photo.id}
            className="w-40 shrink-0 snap-start sm:w-48"
            style={{ transform: polaroidTilt(photo.id) }}
          >
            <Link
              href="/gallery"
              className="block rounded-[var(--radius-md)] bg-white p-2 shadow-[var(--shadow-soft)] transition-shadow hover:shadow-[var(--shadow-lift)]"
            >
              <span className="relative block aspect-square w-full overflow-hidden rounded-[var(--radius-sm)] bg-[var(--color-frost-200)]">
                <PhotoImage photo={photo} sizes="(max-width: 640px) 40vw, 200px" />
              </span>
              <span className="mt-2 block truncate px-0.5 pb-1 font-[family-name:var(--font-script)] text-sm text-[var(--color-plum)]">
                {photo.caption ?? altTextFor(photo)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {showLink && (
        <p className="text-center">
          <Link
            href="/gallery"
            className="inline-flex items-center gap-1.5 font-extrabold text-[var(--color-brand-lilac-dark)] underline-offset-4 hover:underline"
          >
            <SparkleIcon size={16} />
            See the whole gallery
          </Link>
        </p>
      )}
    </div>
  )
}
