import { NextResponse } from 'next/server'
import { getCsrfToken, setCsrfCookie } from '@/lib/csrf'

export async function GET() {
  const response = NextResponse.json({ 
    token: await getCsrfToken() || '' 
  })
  await setCsrfCookie(response)
  return response
}
