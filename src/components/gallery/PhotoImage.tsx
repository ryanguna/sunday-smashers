'use client'

import Image from 'next/image'
import { useState } from 'react'
import { cn } from '@/lib/cn'
import { altTextFor, type GalleryPhoto } from '@/lib/gallery'
import { DemoPhotoArt } from './DemoPhotoArt'

/**
 * Renders a gallery photo.
 *
 * Real uploads go through `next/image` with lazy loading, responsive `sizes`
 * and full optimisation — the Supabase Storage hostname is allow-listed in
 * `next.config.ts` via `images.remotePatterns`.
 *
 * Demo mode (and any image that fails to load — including the case where the
 * hostname isn't allow-listed, e.g. a mis-set env var) falls back to
 * generated festive SVG artwork rather than a broken-image icon.
 */

/** Deterministic aspect ratio so the masonry has pleasant variety. */
const RATIOS = ['aspect-[4/3]', 'aspect-[3/4]', 'aspect-square', 'aspect-[5/4]'] as const

export function photoRatioClass(seed: number): string {
  return RATIOS[((seed % RATIOS.length) + RATIOS.length) % RATIOS.length]
}

export interface PhotoImageProps {
  photo: GalleryPhoto
  /** `sizes` hint passed to next/image. */
  sizes?: string
  /** `contain` for the lightbox, `cover` for the grid. */
  fit?: 'cover' | 'contain'
  className?: string
  priority?: boolean
}

export function PhotoImage({
  photo,
  sizes = '(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw',
  fit = 'cover',
  className,
  priority = false,
}: PhotoImageProps) {
  const [failed, setFailed] = useState(false)
  const alt = altTextFor(photo)

  if (!photo.url || failed) {
    return (
      <div className={cn('flex h-full w-full items-center justify-center overflow-hidden', className)}>
        <DemoPhotoArt seed={photo.artSeed} title={alt} fit={fit} />
      </div>
    )
  }

  return (
    <Image
      src={photo.url}
      alt={alt}
      fill
      sizes={sizes}
      priority={priority}
      loading={priority ? undefined : 'lazy'}
      onError={() => setFailed(true)}
      className={cn(fit === 'cover' ? 'object-cover' : 'object-contain', className)}
    />
  )
}
