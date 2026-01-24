import { NextResponse } from 'next/server'
import { setCsrfCookie } from '@/lib/csrf'

export async function GET() {
  const response = NextResponse.json({ success: true })
  await setCsrfCookie(response)
  return response
}
