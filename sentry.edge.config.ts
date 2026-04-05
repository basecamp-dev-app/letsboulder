import * as Sentry from '@sentry/nextjs'

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
