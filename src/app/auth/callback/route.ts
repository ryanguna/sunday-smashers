import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isSupabaseConfigured } from '@/lib/supabase/config'
import { sanitiseNextPath } from '@/lib/auth'
import { callbackErrorCodeFromParams, loginErrorPath } from '../auth-errors'

/**
 * Handles the redirect back from Supabase for the magic-link, signup
 * confirmation, and password-recovery email flows (`@supabase/ssr` PKCE
 * pattern): exchanges the `code` query param for a session cookie, then
 * sends the browser on to `next` (defaulting to `/onboarding` so a first
 * sign-up lands on profile setup).
 *
 * Every failure path sends the browser to `/login?error=<code>` where the
 * codes come from `../auth-errors` — the login page reads the same module,
 * so a player always gets an explanation and a way to get a fresh link
 * instead of a silent sign-in form.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = sanitiseNextPath(searchParams.get('next') ?? '/onboarding')

  if (!isSupabaseConfigured()) {
    return NextResponse.redirect(`${origin}/login`)
  }

  let exchangeErrorMessage: string | null = null

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`)
    }
    exchangeErrorMessage = error.message
  }

  const errorCode = callbackErrorCodeFromParams({
    code,
    error: searchParams.get('error'),
    errorCode: searchParams.get('error_code'),
    exchangeErrorMessage,
  })

  return NextResponse.redirect(`${origin}${loginErrorPath(errorCode, next)}`)
}
