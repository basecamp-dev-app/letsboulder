import { validateCsrfToken, setCsrfCookie } from './csrf'
import { NextRequest, NextResponse } from 'next/server'

export async function withCsrfProtection(
  request: NextRequest,
  response?: NextResponse
): Promise<{ valid: boolean; response?: NextResponse }> {
  const validationResult = await validateCsrfToken(request)
  
  if (!validationResult) {
    const errorResponse = NextResponse.json(
      { error: 'Invalid or missing CSRF token' },
      { status: 403 }
    )
    return { valid: false, response: errorResponse }
  }

  if (response) {
    await setCsrfCookie(response)
    return { valid: true, response }
  }

  return { valid: true }
}
