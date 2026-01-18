import { cache } from 'react'

const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_INSTANCE_URL || 'https://us.i.posthog.com'
const PROJECT_ID = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_ID
const PERSONAL_API_KEY = process.env.POSTHOG_PERSONAL_API_KEY

interface HogQLResponse {
  results: unknown
  timings?: unknown[]
  is_cached?: boolean
}

async function posthogQuery(sql: string): Promise<{ results: unknown; is_cached?: boolean }> {
  if (!PERSONAL_API_KEY || !PROJECT_ID) {
    throw new Error('PostHog credentials not configured: NEXT_PUBLIC_POSTHOG_PROJECT_ID and POSTHOG_PERSONAL_API_KEY must be set')
  }

  const url = `${POSTHOG_HOST}/api/projects/${PROJECT_ID}/query/`

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${PERSONAL_API_KEY}`,
    },
    body: JSON.stringify({
      query: {
        kind: 'HogQLQuery',
        query: sql,
      },
    }),
    next: { revalidate: 3600 },
  })

  if (!response.ok) {
    const error = await response.text()
    console.error('[PostHog] API error:', response.status, error)
    throw new Error(`PostHog API error: ${response.status} - ${error}`)
  }

  const data = await response.json()
  return data
}

function formatNumber(num: number | null | undefined): string {
  if (num === null || num === undefined) return '0'
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`
  return num.toLocaleString()
}

export const getMAU = cache(async (): Promise<string> => {
  const response = await posthogQuery(
    'SELECT count(DISTINCT distinct_id) FROM events WHERE timestamp >= now() - INTERVAL 30 DAY'
  )
  const results = response.results as number[][]
  const count = results?.[0]?.[0] ?? 0
  return formatNumber(count)
})

export const getDAU = cache(async (): Promise<string> => {
  const response = await posthogQuery(
    'SELECT count(DISTINCT distinct_id) FROM events WHERE timestamp >= now() - INTERVAL 1 DAY'
  )
  const results = response.results as number[][]
  const count = results?.[0]?.[0] ?? 0
  return formatNumber(count)
})

export const getEventsThisMonth = cache(async (): Promise<string> => {
  const response = await posthogQuery(
    'SELECT count() FROM events WHERE timestamp >= now() - INTERVAL 1 MONTH'
  )
  const results = response.results as number[][]
  const count = results?.[0]?.[0] ?? 0
  return formatNumber(count)
})

export const getTrackedUsers = cache(async (): Promise<string> => {
  const response = await posthogQuery(
    'SELECT count(DISTINCT distinct_id) FROM events'
  )
  const results = response.results as number[][]
  const count = results?.[0]?.[0] ?? 0
  return formatNumber(count)
})

export const getTopEvents = cache(async (): Promise<{ event: string; count: number }[]> => {
  const response = await posthogQuery(
    'SELECT event, count() as count FROM events WHERE timestamp >= now() - INTERVAL 30 DAY GROUP BY event ORDER BY count() DESC LIMIT 10'
  )
  const results = response.results as unknown as Array<[string, number]>
  const rows = Array.isArray(results) ? results : []
  return rows.slice(0, 5).map((row: [string, number]) => ({
    event: row[0] || 'unknown',
    count: Number(row[1]) || 0,
  }))
})

export interface SponsorMetrics {
  mau: string
  dau: string
  eventsThisMonth: string
  trackedUsers: string
  topEvents: { event: string; count: number }[]
}

export async function getSponsorMetrics(): Promise<SponsorMetrics> {
  const [mau, dau, eventsThisMonth, trackedUsers, topEvents] = await Promise.all([
    getMAU(),
    getDAU(),
    getEventsThisMonth(),
    getTrackedUsers(),
    getTopEvents(),
  ])

  return {
    mau,
    dau,
    eventsThisMonth,
    trackedUsers,
    topEvents,
  }
}
