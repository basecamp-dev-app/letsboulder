import * as Sentry from '@sentry/nextjs'

function getSampleRate(value: string | undefined, fallback: number): number {
  const parsed = Number(value)

  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    return fallback
  }

  return parsed
}

function isReplayAllowed(pathname: string): boolean {
  return (
    pathname === '/' ||
    pathname.startsWith('/crag') ||
    pathname.startsWith('/climb')
  )
}

const isProduction = process.env.NODE_ENV === 'production'
const pathname = typeof window === 'undefined' ? '' : window.location.pathname
const replayEnabled = isProduction && isReplayAllowed(pathname)

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  enabled: isProduction,
  replaysOnErrorSampleRate: replayEnabled
    ? getSampleRate(process.env.NEXT_PUBLIC_SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE, 0)
    : 0,
  replaysSessionSampleRate: replayEnabled
    ? getSampleRate(process.env.NEXT_PUBLIC_SENTRY_REPLAYS_SESSION_SAMPLE_RATE, 0)
    : 0,
  integrations: [
    Sentry.replayIntegration({
      maskAllText: true,
      blockAllMedia: true,
    }),
  ],
})
