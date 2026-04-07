import { SignJWT, jwtVerify } from 'jose'
import { NextRequest, NextResponse } from 'next/server'
import { serverEnv } from '@/lib/env.server'
import { getServerClientFromRequest } from '@/lib/supabase-server'

const CSRF_COOKIE_NAME = 'csrf_token'

function getCsrfSecret(): Uint8Array {
  const csrfSecretValue = serverEnv.CSRF_SECRET

  if (!csrfSecretValue) {
    throw new Error('FATAL: CSRF_SECRET is required')
  }

  return new TextEncoder().encode(csrfSecretValue)
}

export async function generateCsrfToken(userId: string): Promise<string> {
  return new SignJWT({ action: 'csrf', sub: userId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('2h')
    .sign(getCsrfSecret())
}

export async function setCsrfCookie(
  request: NextRequest,
  response: NextResponse
): Promise<void> {
  const supabase = getServerClientFromRequest(request)
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return

  const token = await generateCsrfToken(user.id)
  response.cookies.set(CSRF_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 60 * 60 * 2,
    path: '/',
  })
}

export async function validateCsrfToken(request: NextRequest): Promise<boolean> {
  const token = request.headers.get('x-csrf-token')
  const cookieToken = request.cookies.get(CSRF_COOKIE_NAME)?.value

  if (!token || !cookieToken) return false
  if (token !== cookieToken) return false

  try {
    const { payload } = await jwtVerify(token, getCsrfSecret())
    if (payload.action !== 'csrf') return false

    const supabase = getServerClientFromRequest(request)
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) return false
    if (payload.sub !== user.id) return false

    return true
  } catch {
    return false
  }
}
