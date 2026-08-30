'use client'

import { cn } from '@/lib/cn'
import { Badge } from '@/components/ui'
import { SparkleIcon } from '@/components/icons'
import { moderationBadgeStatus, moderationLabel, polaroidTilt, type GalleryPhoto } from '@/lib/gallery'
import { PhotoImage, photoRatioClass } from './PhotoImage'

/**
 * One photo, framed like a polaroid pegged to a string of fairy lights.
 *
 * The tilt comes from `polaroidTilt()`, which returns an already-rounded
 * `rotate(x.xxdeg)` string — inline styles built from raw floats serialise
 * differently on the server and the client and cause hydration warnings.
 */
export interface PhotoCardProps {
  photo: GalleryPhoto
  index: number
  onOpen?: (photo: GalleryPhoto) => void
  /** Show the moderation badge (admin queue). */
  showStatus?: boolean
  className?: string
  priority?: boolean
}

export function PhotoCard({
  photo,
  index,
  onOpen,
  showStatus = false,
  className,
  priority = false,
}: PhotoCardProps) {
  const caption = photo.caption
  const inner = (
    <>
      <div className={cn('relative w-full overflow-hidden rounded-[var(--radius-sm)] bg-[var(--color-frost-200)]', photoRatioClass(photo.artSeed))}>
        <PhotoImage photo={photo} priority={priority} />
        {photo.isFeatured && (
          <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-[var(--radius-pill)] bg-white/90 px-2 py-0.5 text-[0.7rem] font-bold text-[var(--color-brand-gold-dark)] shadow-[var(--shadow-soft)]">
            <SparkleIcon size={12} />
            Pick of the day
          </span>
        )}
      </div>
      <div className="mt-2 px-0.5 pb-1">
        <p
          className={cn(
            'line-clamp-2 text-[0.82rem] leading-snug',
            caption
              ? 'font-[family-name:var(--font-script)] text-[0.95rem] text-[var(--color-plum)]'
              : 'text-[var(--color-ink-muted)] italic'
          )}
        >
          {caption ?? 'Untitled festive moment'}
        </p>
        {(photo.matchLabel || showStatus) && (
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {photo.matchLabel && (
              <span className="truncate text-[0.68rem] font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]">
                {photo.matchLabel}
              </span>
            )}
            {showStatus && (
              <Badge status={moderationBadgeStatus(photo.status)} className="px-2 py-0 text-[0.68rem]">
                {moderationLabel(photo.status)}
              </Badge>
            )}
          </div>
        )}
      </div>
    </>
  )

  const frameClasses = cn(
    'group relative block w-full rounded-[var(--radius-md)] bg-white p-2 text-left shadow-[var(--shadow-soft)] transition-[transform,box-shadow] duration-200',
    onOpen && 'hover:z-10 hover:shadow-[var(--shadow-lift)] motion-safe:hover:-translate-y-1',
    className
  )

  return (
    <div
      className="mb-4 break-inside-avoid motion-safe:animate-fade-in"
      style={{ transform: polaroidTilt(photo.id) }}
    >
      {/* Peg holding the polaroid to the fairy-light string. */}
      <span
        aria-hidden="true"
        className="mx-auto mb-[-6px] block h-3 w-6 rounded-[3px] bg-[image:var(--gradient-candy)] shadow-[var(--shadow-soft)]"
      />
      {onOpen ? (
        <button
          type="button"
          onClick={() => onOpen(photo)}
          className={frameClasses}
          aria-label={`Open photo ${index + 1}${caption ? `: ${caption}` : ''}`}
        >
          {inner}
        </button>
      ) : (
        <div className={frameClasses}>{inner}</div>
      )}
    </div>
  )
}
