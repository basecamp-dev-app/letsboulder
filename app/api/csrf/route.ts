import { NextRequest, NextResponse } from 'next/server'
import { setCsrfCookie } from '@/lib/csrf'
import { getServerClientFromRequest } from '@/lib/supabase-server'

export async function GET(request: NextRequest) {
  const supabase = getServerClientFromRequest(request)
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const response = NextResponse.json({ token: '' })
  await setCsrfCookie(request, response)

  const token = response.cookies.get('csrf_token')?.value ?? ''
  return NextResponse.json({ token })
}
