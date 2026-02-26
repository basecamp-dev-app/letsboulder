import { NextResponse } from 'next/server'
import { generateCsrfToken } from '@/lib/csrf'

export async function GET() {
  const token = await generateCsrfToken()
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
