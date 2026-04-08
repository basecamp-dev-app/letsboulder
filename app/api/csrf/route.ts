import { NextRequest, NextResponse } from 'next/server'
import { generateCsrfToken } from '@/lib/csrf'
import { getServerClientFromRequest } from '@/lib/supabase-server'

export async function GET(request: NextRequest) {
  const supabase = getServerClientFromRequest(request)
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const token = await generateCsrfToken(user.id)
  const response = NextResponse.json({ token })

  response.cookies.set('csrf_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 60 * 60 * 2,
    path: '/',
  })

  return response
}
