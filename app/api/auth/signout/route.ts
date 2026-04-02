import { NextRequest, NextResponse } from 'next/server'
// eslint-disable-next-line no-restricted-imports -- cookie write-back required for signOut
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { validateCsrfToken } from '@/lib/csrf'
import { serverEnv } from '@/lib/env'

export async function POST(request: NextRequest) {
  const csrfValid = await validateCsrfToken(request)
  if (!csrfValid) {
    return NextResponse.json({ error: 'Invalid or missing CSRF token' }, { status: 403 })
  }

  const cookieStore = await cookies()
  const supabase = createServerClient(
    serverEnv.NEXT_PUBLIC_SUPABASE_URL,
    serverEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        },
      },
    }
  )

  const { error } = await supabase.auth.signOut()
  if (error) {
    return NextResponse.json({ error: 'Failed to sign out' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
