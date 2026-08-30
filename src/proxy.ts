import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { isSupabaseConfigured, supabaseAnonKey, supabaseUrl } from '@/lib/supabase/config'

/**
 * Refreshes the Supabase auth session cookie on every matched request.
 *
 * Named `proxy.ts` per Next.js 16 convention (the `middleware.ts` file
 * convention is deprecated and renamed to `proxy`).
 */
export async function proxy(request: NextRequest) {
  // Demo mode: no Supabase configured, skip session handling entirely so the
  // app keeps working (e.g. `npm run build` / CI e2e run with no env vars).
  if (!isSupabaseConfigured()) {
    return NextResponse.next({ request })
  }

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        supabaseResponse = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options),
        )
      },
    },
  })

  // Refresh the session if expired — keeps server components in sync.
  await supabase.auth.getUser()

  return supabaseResponse
}

export const config = {
  matcher: [
    // Skip static assets, Next.js image optimization, and favicon.
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
}
