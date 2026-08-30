import { createClient } from '@/lib/supabase/server'
import { isSupabaseConfigured } from '@/lib/supabase/config'
import type { AnnouncementsClient } from '@/lib/announcements'

/**
 * Server-only factory for the Supabase client the announcement fetchers in
 * `@/lib/announcements` take as an argument. Kept out of that module so it
 * stays safe to import from Client Components (importing
 * `@/lib/supabase/server` there drags `next/headers` into the browser
 * bundle). Returns `null` in demo mode, which makes every fetcher fall back
 * to the bundled festive fixtures.
 */
export async function announcementsClient(): Promise<AnnouncementsClient | null> {
  if (!isSupabaseConfigured()) return null
  return createClient()
}
