import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { supabaseAnonKey, supabaseUrl } from './config'
import type { Database } from './types'

/**
 * Server Supabase client (Server Components, Route Handlers, Server Actions).
 * Uses the Next.js 16 async `cookies()` API.
 *
 * Safe to call even when env vars are absent — guard real data access with
 * `isSupabaseConfigured()` from `./config` before trusting the client.
 */
export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient<Database>(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          )
        } catch {
          // Called from a Server Component — cookies can't be written here.
          // Session refresh happens in the proxy (middleware) instead.
        }
      },
    },
  })
}
