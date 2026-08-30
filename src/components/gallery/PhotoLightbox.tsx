'use client'

import { useCallback, useEffect, useRef, type TouchEvent } from 'react'
import { Modal } from '@/components/ui'
import { SparkleIcon } from '@/components/icons'
import { altTextFor, dayLabel, dayKeyOf, type GalleryPhoto } from '@/lib/gallery'
import { PhotoImage } from './PhotoImage'

/**
 * Full-screen photo viewer.
 *
 * `Modal` already provides the focus trap, Escape-to-close, scroll lock and
 * focus restoration, so this only adds arrow-key navigation and horizontal
 * swipe on touch devices.
 */
export interface PhotoLightboxProps {
  photos: readonly GalleryPhoto[]
  /** Index into `photos`, or `null` when closed. */
  index: number | null
  onClose: () => void
  onNavigate: (index: number) => void
}

const SWIPE_THRESHOLD_PX = 48

export function PhotoLightbox({ photos, index, onClose, onNavigate }: PhotoLightboxProps) {
  const touchStartX = useRef<number | null>(null)
  const open = index !== null && index >= 0 && index < photos.length
  const photo = open ? photos[index] : null

  const go = useCallback(
    (delta: number) => {
      if (index === null || photos.length === 0) return
      const next = (index + delta + photos.length) % photos.length
      onNavigate(next)
    },
    [index, onNavigate, photos.length]
  )

  useEffect(() => {
    if (!open) return
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'ArrowRight') {
        event.preventDefault()
        go(1)
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault()
        go(-1)
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [open, go])

  if (!open || !photo) return null

  const position = `${index + 1} of ${photos.length}`

  function handleTouchStart(event: TouchEvent<HTMLDivElement>) {
    touchStartX.current = event.changedTouches[0]?.clientX ?? null
  }

  function handleTouchEnd(event: TouchEvent<HTMLDivElement>) {
    const start = touchStartX.current
    touchStartX.current = null
    if (start === null) return
    const delta = (event.changedTouches[0]?.clientX ?? start) - start
    if (Math.abs(delta) < SWIPE_THRESHOLD_PX) return
    go(delta < 0 ? 1 : -1)
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={photo.caption ?? 'Festive moment'}
      className="max-w-3xl p-4 sm:p-5"
    >
      <div
        className="relative"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        role="group"
        aria-label={`Photo ${position}. Use the left and right arrow keys to browse.`}
      >
        <div className="relative mx-auto flex h-[52vh] w-full items-center justify-center overflow-hidden rounded-[var(--radius-md)] bg-[var(--color-frost-200)] sm:h-[60vh]">
          <PhotoImage photo={photo} fit="contain" sizes="(max-width: 768px) 92vw, 720px" priority />
        </div>

        <button
          type="button"
          onClick={() => go(-1)}
          aria-label="Previous photo"
          className="absolute left-1 top-1/2 -translate-y-1/2 rounded-full bg-white/90 p-2 text-[var(--color-plum)] shadow-[var(--shadow-soft)] hover:bg-white"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M15 5 8 12l7 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <button
          type="button"
          onClick={() => go(1)}
          aria-label="Next photo"
          className="absolute right-1 top-1/2 -translate-y-1/2 rounded-full bg-white/90 p-2 text-[var(--color-plum)] shadow-[var(--shadow-soft)] hover:bg-white"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="m9 5 7 7-7 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
        <p className="min-w-0 flex-1 text-[var(--color-ink-soft)]">
          <span className="sr-only">Photo description: </span>
          {altTextFor(photo)}
        </p>
        <span className="shrink-0 font-[family-name:var(--font-heading)] text-[var(--color-ink-muted)]">
          {position}
        </span>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.78rem] text-[var(--color-ink-muted)]">
        <span>{dayLabel(dayKeyOf(photo.createdAt))}</span>
        {photo.matchLabel && <span>· {photo.matchLabel}</span>}
        {photo.isFeatured && (
          <span className="inline-flex items-center gap-1 text-[var(--color-brand-gold-dark)]">
            <SparkleIcon size={13} />
            Pick of the day
          </span>
        )}
      </div>
      <p className="mt-2 text-[0.72rem] text-[var(--color-ink-muted)]">
        Tip: use <kbd className="rounded bg-[var(--color-frost-200)] px-1">←</kbd>{' '}
        <kbd className="rounded bg-[var(--color-frost-200)] px-1">→</kbd> to browse, swipe on touch,
        and <kbd className="rounded bg-[var(--color-frost-200)] px-1">Esc</kbd> to close.
      </p>
    </Modal>
  )
}
