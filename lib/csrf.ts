import { SignJWT, jwtVerify } from 'jose'
import { NextRequest, NextResponse } from 'next/server'
import { serverEnv } from '@/lib/env.server'

const CSRF_COOKIE_NAME = 'csrf_token'

function getCsrfSecret(): Uint8Array {
  const csrfSecretValue = serverEnv.CSRF_SECRET

  if (!csrfSecretValue && process.env.NODE_ENV === 'production') {
    throw new Error('FATAL: CSRF_SECRET missing')
  }

  return new TextEncoder().encode(csrfSecretValue || 'dev-csrf-secret')
}

export async function generateCsrfToken(): Promise<string> {
  return new SignJWT({ action: 'csrf' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('2h')
    .sign(getCsrfSecret())
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
    const { payload } = await jwtVerify(token, getCsrfSecret())
    return payload.action === 'csrf'
  } catch {
    return false
  }
}
