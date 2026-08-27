import * as Sentry from '@sentry/nextjs'
import { validateServerEnv } from '@/lib/env.server'

const isProduction = process.env.NODE_ENV === 'production'

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  enabled: isProduction,
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
