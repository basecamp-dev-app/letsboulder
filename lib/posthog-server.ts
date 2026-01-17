import { PostHog } from 'posthog-node'
import { cache } from 'react'

const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_INSTANCE_URL || 'https://us.i.posthog.com'
const PROJECT_ID = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_ID
const PERSONAL_API_KEY = process.env.POSTHOG_PERSONAL_API_KEY

let posthogClient: PostHog | null = null

function getClient(): PostHog {
  if (!posthogClient) {
    if (!PERSONAL_API_KEY || !PROJECT_ID) {
      throw new Error('PostHog credentials not configured: NEXT_PUBLIC_POSTHOG_PROJECT_ID and POSTHOG_PERSONAL_API_KEY must be set')
    }
    posthogClient = new PostHog(PROJECT_ID, {
      apiKey: PERSONAL_API_KEY,
      host: POSTHOG_HOST,
    })
  }
  return posthogClient
}

interface HogQLResponse {
  results: unknown
  timings?: unknown[]
  is_cached?: boolean
}

async function posthogQuery(sql: string): Promise<HogQLResponse> {
  const client = getClient()
  return client.executeQuery({
    query: sql,
    kind: 'HogQLQuery',
  })
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
  const count = (response.results as { count?: number })?.count ?? 0
  return formatNumber(count)
})

export const getDAU = cache(async (): Promise<string> => {
  const response = await posthogQuery(
    'SELECT count(DISTINCT distinct_id) FROM events WHERE timestamp >= now() - INTERVAL 1 DAY'
  )
  const count = (response.results as { count?: number })?.count ?? 0
  return formatNumber(count)
})

export const getEventsThisMonth = cache(async (): Promise<string> => {
  const response = await posthogQuery(
    'SELECT count() FROM events WHERE timestamp >= now() - INTERVAL 1 MONTH'
  )
  const count = (response.results as { count?: number })?.count ?? 0
  return formatNumber(count)
})

export const getTotalUsers = cache(async (): Promise<string> => {
  const response = await posthogQuery(
    'SELECT count(DISTINCT distinct_id) FROM events'
  )
  const count = (response.results as { count?: number })?.count ?? 0
  return formatNumber(count)
})

export const getTopEvents = cache(async (): Promise<{ event: string; count: number }[]> => {
  const response = await posthogQuery(
    'SELECT event, count() as count FROM events WHERE timestamp >= now() - INTERVAL 30 DAY GROUP BY event ORDER BY count() DESC LIMIT 10'
  )
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
