import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { isSupabaseConfigured, supabaseAnonKey, supabaseUrl } from '@/lib/supabase/config'

/**
 * Route prefixes that require a signed-in session. `/tv/**` (the unattended
 * courtside display), the public results pages, and everything else stay
 * open — this list must stay narrow and explicit rather than "everything
 * except a public allow-list", so a new public route never accidentally
 * becomes gated.
 */
const PROTECTED_PREFIXES = ['/admin', '/dashboard', '/scoring', '/tabulator']

function loginRedirect(request: NextRequest): NextResponse {
  const url = request.nextUrl.clone()
  const next = `${request.nextUrl.pathname}${request.nextUrl.search}`
  url.pathname = '/login'
  url.search = `?next=${encodeURIComponent(next)}`
  return NextResponse.redirect(url)
}

/**
 * Refreshes the Supabase auth session cookie on every matched request, and
 * gates the protected route prefixes above behind a signed-in session
 * (role-level checks — e.g. "is this user an admin" — happen in the page
 * itself via `requireRole`/`requireAdmin` in `src/lib/auth.ts`, since that
 * needs a DB round trip the proxy shouldn't do on every request).
 *
 * Named `proxy.ts` per Next.js 16 convention (the `middleware.ts` file
 * convention is deprecated and renamed to `proxy`).
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const isProtected = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  )

  // Demo mode: no Supabase configured, skip session handling entirely so the
  // app keeps working (e.g. `npm run build` / CI e2e run with no env vars).
  // Protected routes still render — they show a "not configured" notice
  // rather than redirecting, since there is no login flow to redirect to.
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
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (isProtected && !user) {
    return loginRedirect(request)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    // Skip static assets, Next.js image optimization, and favicon.
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
}
