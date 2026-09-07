import { headers } from 'next/headers'

import type { ActionResult } from '@/lib/actions/action-result'
import { rateLimit, type RateLimitKey } from '@/lib/rate-limit'

function formatRetryDelay(seconds: number): string {
  if (seconds < 60) return `${seconds} second${seconds === 1 ? '' : 's'}`
  const minutes = Math.max(1, Math.ceil(seconds / 60))
  return `${minutes} minute${minutes === 1 ? '' : 's'}`
}

async function getActionRequest(): Promise<Request> {
  const actionHeaders = new Headers()

  try {
    const requestHeaders = await headers()
    requestHeaders.forEach((value, key) => actionHeaders.set(key, value))
  } catch {
    // Unit tests and non-request callers do not always provide a Next request
    // context. Authenticated action limits still key on user ID in that case.
  }

  return new Request('http://localhost/server-action', {
    method: 'POST',
    headers: actionHeaders,
  })
}

export async function applyActionRateLimit<T = void>(
  key: RateLimitKey,
  userId: string,
  message: string,
): Promise<ActionResult<T> | null> {
  const result = await rateLimit(await getActionRequest(), key, userId)
  if (result.success) return null

  const retryAfter = Math.max(1, Math.ceil((result.resetTime - Date.now()) / 1000))
  return {
    success: false,
    error: `${message} Try again in ${formatRetryDelay(retryAfter)}.`,
    status: 429,
    retryAfter,
    resetAt: result.resetTime,
  }
}
