import { NextRequest, NextResponse } from 'next/server'
import { getRouteClient } from '@/lib/supabase-server'
import { validateCsrfToken } from '@/lib/csrf'

export async function POST(request: NextRequest) {
  const csrfValid = await validateCsrfToken(request)
  if (!csrfValid) {
    return NextResponse.json({ error: 'Invalid or missing CSRF token' }, { status: 403 })
  }

  const response = NextResponse.json({ success: true, clearAuthCaches: true })
  const supabase = getRouteClient(request, response)

  const { error } = await supabase.auth.signOut()
  if (error) {
    return NextResponse.json({ error: 'Failed to sign out' }, { status: 500 })
  }

  return response
}
