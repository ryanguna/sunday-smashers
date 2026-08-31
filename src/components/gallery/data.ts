import { createClient } from '@/lib/supabase/client'
import { isSupabaseConfigured } from '@/lib/supabase/config'
import { getSchedule, teamDisplayName, type PublicMatch } from '@/lib/public-data'
import {
  getFeaturedGalleryPhotos,
  getGalleryTournamentId,
  getPublicGalleryPhotos,
  type GalleryPhoto,
  type GallerySupabaseClient,
  type PhotoMatchInfo,
} from '@/lib/gallery'

/**
 * Data loading for the gallery surfaces.
 *
 * Deliberately uses the **browser** Supabase client for anonymous reads (the
 * same trick `@/lib/public-data` and `@/lib/tv/data` use) rather than
 * `@/lib/supabase/server`: that module imports `next/headers`, and anything
 * transitively importing it from a `'use client'` component breaks
 * `npm run build`. Only approved photos are public, so an anonymous read is
 * exactly right here.
 */

function galleryClient(): GallerySupabaseClient | null {
  if (!isSupabaseConfigured()) return null
  return createClient() as unknown as GallerySupabaseClient
}

/** Human label for a match, e.g. `Court 1 · Smash Clauses vs Net Elves`. */
export function matchLabel(match: PublicMatch): string {
  const teams = `${teamDisplayName(match.teamA, match.sourceA)} vs ${teamDisplayName(match.teamB, match.sourceB)}`
  return match.court ? `${match.court} · ${teams}` : teams
}

export function buildMatchIndex(
  matches: readonly PublicMatch[]
): Record<string, PhotoMatchInfo> {
  const index: Record<string, PhotoMatchInfo> = {}
  for (const match of matches) {
    index[match.id] = { id: match.id, division: match.division, label: matchLabel(match) }
  }
  return index
}

export interface GalleryPageData {
  photos: GalleryPhoto[]
  /** Null against a real project with no tournament row yet — uploads are off. */
  tournamentId: string | null
  isDemo: boolean
}

/** Everything `/gallery` needs. Never throws — falls back to the demo set. */
export async function loadGalleryPage(): Promise<GalleryPageData> {
  const client = galleryClient()
  const isDemo = client === null

  let matches: PublicMatch[] = []
  try {
    matches = await getSchedule()
  } catch {
    matches = []
  }

  const [photos, tournamentId] = await Promise.all([
    getPublicGalleryPhotos(client, { matches: buildMatchIndex(matches) }),
    getGalleryTournamentId(client),
  ])

  return { photos, tournamentId, isDemo }
}

/**
 * Just the highlights, for `FeaturedPhotoStrip`. Hits the
 * `idx_photos_featured` partial index rather than loading the whole gallery.
 */
export async function loadFeaturedPhotos(limit = 6): Promise<GalleryPhoto[]> {
  const client = galleryClient()

  let matches: PublicMatch[] = []
  try {
    matches = await getSchedule()
  } catch {
    matches = []
  }

  return getFeaturedGalleryPhotos(client, limit, { matches: buildMatchIndex(matches) })
}
