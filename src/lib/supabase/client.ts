import { createBrowserClient } from '@supabase/ssr'
import { supabaseAnonKey, supabaseUrl } from './config'
import type { Database } from './types'

/**
 * Browser Supabase client. Safe to call even when env vars are absent —
 * `createBrowserClient` itself doesn't throw until a network call is made,
 * so callers should guard with `isSupabaseConfigured()` from `./config`
 * before relying on the returned client for real data.
 */
export function createClient() {
  return createBrowserClient<Database>(supabaseUrl, supabaseAnonKey)
}
