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
 * Note on images: real uploads render through `next/image` with
 * `unoptimized`, because the Supabase Storage hostname is not allow-listed
 * in `next.config.ts`. To turn optimisation on, add:
 *
 * ```ts
 * images: {
 *   remotePatterns: [
 *     { protocol: 'https', hostname: '<project-ref>.supabase.co', pathname: '/storage/v1/object/public/**' },
 *   ],
 * }
 * ```
 *
 * …and drop the `unoptimized` prop in `PhotoImage`.
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
