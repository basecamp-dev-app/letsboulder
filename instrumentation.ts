import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  enabled: process.env.NODE_ENV === 'production',
  tracesSampleRate: 1.0,
})

export function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Node.js runtime initialization
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    // Edge runtime initialization
  }
}
