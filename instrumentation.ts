import * as Sentry from '@sentry/nextjs'
import { validateServerEnv } from '@/lib/env.server'

function getSampleRate(value: string | undefined, fallback: number): number {
  const parsed = Number(value)

  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    return fallback
  }

  return parsed
}

const isProduction = process.env.NODE_ENV === 'production'

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  enabled: isProduction,
  tracesSampleRate: isProduction ? getSampleRate(process.env.SENTRY_TRACES_SAMPLE_RATE, 0.05) : 1,
})

export function register() {
  validateServerEnv()

  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Node.js runtime initialization
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    // Edge runtime initialization
  }
}
