/**
 * Photo gallery components.
 *
 * For other pages, the one you probably want is **`FeaturedPhotoStrip`** —
 * an async Server Component that renders a row of pegged polaroid
 * highlights and needs no props:
 *
 * ```tsx
 * import { FeaturedPhotoStrip } from '@/components/gallery'
 * <FeaturedPhotoStrip limit={6} />
 * ```
 *
 * Note on images: real uploads render through `next/image` with full
 * optimisation — `next.config.ts` allow-lists the Supabase Storage hostname
 * via `images.remotePatterns`, derived from `NEXT_PUBLIC_SUPABASE_URL`. In
 * demo mode there is no bucket, so photos fall back to generated festive SVG
 * artwork and no remote image is ever requested.
 */
export * from './DemoPhotoArt'
export * from './FeaturedPhotoStrip'
export * from './GalleryExplorer'
export * from './GalleryModeration'
export * from './PhotoCard'
export * from './PhotoImage'
export * from './PhotoLightbox'
export * from './PhotoUploader'
export * from './data'
