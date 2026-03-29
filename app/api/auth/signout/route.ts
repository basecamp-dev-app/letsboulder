import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { validateCsrfToken } from '@/lib/csrf'

export async function POST(request: NextRequest) {
  const csrfError = await validateCsrfToken(request)
  if (csrfError) return csrfError

  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
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
