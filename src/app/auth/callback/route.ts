import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isSupabaseConfigured } from '@/lib/supabase/config'
import { sanitiseNextPath } from '@/lib/auth'

/**
 * Handles the redirect back from Supabase for the magic-link, signup
 * confirmation, and password-recovery email flows (`@supabase/ssr` PKCE
 * pattern): exchanges the `code` query param for a session cookie, then
 * sends the browser on to `next` (defaulting to `/onboarding` so a first
 * sign-up lands on profile setup).
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = sanitiseNextPath(searchParams.get('next') ?? '/onboarding')

  if (!isSupabaseConfigured()) {
    return NextResponse.redirect(`${origin}/login`)
  }

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`)
}
