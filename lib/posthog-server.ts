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
