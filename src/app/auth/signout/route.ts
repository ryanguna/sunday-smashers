import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isSupabaseConfigured } from '@/lib/supabase/config'

/**
 * Sign-out route handler. POST from a form (no client JS needed) — used by
 * `SiteHeader`/nav "Sign out" buttons elsewhere in the app.
 */
export async function POST(request: NextRequest) {
  if (isSupabaseConfigured()) {
    const supabase = await createClient()
    await supabase.auth.signOut()
  }
  return NextResponse.redirect(new URL('/', request.url), { status: 303 })
}
