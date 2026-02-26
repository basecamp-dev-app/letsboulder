import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

const csrfSecretValue = process.env.CSRF_SECRET?.trim()

if (!csrfSecretValue && process.env.NODE_ENV === 'production') {
  throw new Error('FATAL: CSRF_SECRET missing')
}

const CSRF_SECRET = new TextEncoder().encode(csrfSecretValue || `dev-csrf-${process.pid}`)
const CSRF_COOKIE_NAME = 'csrf_token'

export async function generateCsrfToken(): Promise<string> {
  return new SignJWT({ action: 'csrf' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('2h')
    .sign(CSRF_SECRET)
}

export async function getCsrfToken(): Promise<string | undefined> {
  const cookieStore = await cookies()
  return cookieStore.get(CSRF_COOKIE_NAME)?.value
}

export async function setCsrfCookie(response: NextResponse): Promise<void> {
  const token = await generateCsrfToken()
  response.cookies.set(CSRF_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 60 * 60 * 2,
    path: '/'
  })
}

export async function validateCsrfToken(request: NextRequest): Promise<boolean> {
  const token = request.headers.get('x-csrf-token')
  const cookieToken = request.cookies.get(CSRF_COOKIE_NAME)?.value

  if (!token || !cookieToken) return false
  if (token !== cookieToken) return false

  try {
    const { payload } = await jwtVerify(token, CSRF_SECRET)
    return payload.action === 'csrf'
  } catch {
    return false
  }
}
