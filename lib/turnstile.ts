'use server'

import { serverEnv } from '@/lib/env.server'
import { reportError } from '@/lib/errors'

export interface TurnstileVerificationResult {
  success: boolean
  'error-codes'?: string[]
  challenge_ts?: string
  hostname?: string
  action?: string
  cdata?: string
}

export async function verifyTurnstile(token: string): Promise<TurnstileVerificationResult> {
  const secretKey = serverEnv.TURNSTILE_SECRET_KEY

  if (!secretKey) {
    reportError(new Error('TURNSTILE_SECRET_KEY not configured'), {
      message: 'Turnstile verification skipped - secret key missing',
      level: 'warning',
    })
    return { success: false, 'error-codes': ['missing-secret-key'] }
  }

  if (!token) {
    return { success: false, 'error-codes': ['missing-input-response'] }
  }

  try {
    const formData = new FormData()
    formData.append('secret', secretKey)
    formData.append('response', token)

    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: formData,
    })

    const result = (await response.json()) as TurnstileVerificationResult

    if (!result.success) {
      reportError(new Error('Turnstile verification failed'), {
        message: 'Turnstile verification failed',
        level: 'warning',
        extra: { errorCodes: result['error-codes'] },
      })
    }

    return result
  } catch (error) {
    reportError(error, { message: 'Turnstile verification request failed', level: 'error' })
    return { success: false, 'error-codes': ['verification-failed'] }
  }
}