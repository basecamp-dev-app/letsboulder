import { cache } from 'react'

const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_INSTANCE_URL || 'https://us.i.posthog.com'
const PROJECT_ID = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_ID
const PERSONAL_API_KEY = process.env.POSTHOG_PERSONAL_API_KEY

interface HogQLResponse {
  results: unknown
  timings?: unknown[]
  is_cached?: boolean
}

async function posthogQuery(sql: string, name?: string): Promise<HogQLResponse | null> {
  if (!PERSONAL_API_KEY || !PROJECT_ID) {
    console.warn('PostHog credentials not configured, skipping query')
    return null
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
      ...(name && { name }),
    }),
    next: { revalidate: 3600 },
  })

  if (!response.ok) {
    const error = await response.text()
    console.error(`PostHog API error: ${error}`)
    return null
  }

  return response.json()
}

function formatNumber(num: number | null | undefined): string {
  if (num === null || num === undefined) return '0'
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`
  return num.toLocaleString()
}

export const getMAU = cache(async (): Promise<string> => {
  const response = await posthogQuery(
    'SELECT count(DISTINCT distinct_id) FROM events WHERE timestamp >= now() - INTERVAL 30 DAY',
    'sponsor_mau'
  )
  if (!response) return '0'
  const count = (response.results as { count?: number })?.count ?? 0
  return formatNumber(count)
})

export const getDAU = cache(async (): Promise<string> => {
  const response = await posthogQuery(
    'SELECT count(DISTINCT distinct_id) FROM events WHERE timestamp >= now() - INTERVAL 1 DAY',
    'sponsor_dau'
  )
  if (!response) return '0'
  const count = (response.results as { count?: number })?.count ?? 0
  return formatNumber(count)
})

export const getEventsThisMonth = cache(async (): Promise<string> => {
  const response = await posthogQuery(
    'SELECT count() FROM events WHERE timestamp >= now() - INTERVAL 1 MONTH',
    'sponsor_events_month'
  )
  if (!response) return '0'
  const count = (response.results as { count?: number })?.count ?? 0
  return formatNumber(count)
})

export const getTotalUsers = cache(async (): Promise<string> => {
  const response = await posthogQuery(
    'SELECT count(DISTINCT distinct_id) FROM events',
    'sponsor_total_users'
  )
  if (!response) return '0'
  const count = (response.results as { count?: number })?.count ?? 0
  return formatNumber(count)
})

export const getTopEvents = cache(async (): Promise<{ event: string; count: number }[]> => {
  const response = await posthogQuery(
    'SELECT event, count() as count FROM events WHERE timestamp >= now() - INTERVAL 30 DAY GROUP BY event ORDER BY count() DESC LIMIT 10',
    'sponsor_top_events'
  )
  if (!response) return []
  const results = (response.results as { event?: string; count?: number }[]) || []
  return results.slice(0, 5).map((row) => ({
    event: row.event || 'unknown',
    count: Number(row.count) || 0,
  }))
})

export interface SponsorMetrics {
  mau: string
  dau: string
  eventsThisMonth: string
  totalUsers: string
  topEvents: { event: string; count: number }[]
}

export async function getSponsorMetrics(): Promise<SponsorMetrics> {
  const [mau, dau, eventsThisMonth, totalUsers, topEvents] = await Promise.all([
    getMAU(),
    getDAU(),
    getEventsThisMonth(),
    getTotalUsers(),
    getTopEvents(),
  ])

  return {
    mau,
    dau,
    eventsThisMonth,
    totalUsers,
    topEvents,
  }
}
