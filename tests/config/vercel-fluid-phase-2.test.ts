import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, test } from 'vitest'

const root = process.cwd()

function readSource(relativePath: string) {
  return readFileSync(path.join(root, relativePath), 'utf8')
}

describe('Vercel Fluid Phase 2 configuration', () => {
  test('excludes Sentry tracing while preserving error replay safeguards', () => {
    const client = readSource('sentry.client.config.ts')
    const node = readSource('instrumentation.ts')
    const edge = readSource('sentry.edge.config.ts')
    const nextConfig = readSource('next.config.ts')

    for (const source of [client, node, edge]) {
      expect(source).not.toContain('tracesSampleRate')
    }
    expect(client).not.toContain('profilesSampleRate')
    expect(client).toContain('replaysOnErrorSampleRate')
    expect(client).toContain('maskAllText: true')
    expect(client).toContain('blockAllMedia: true')
    expect(nextConfig).toContain('excludeTracing: true')
    expect(nextConfig).not.toContain('tunnelRoute')
  })

  test.each([
    'app/api/rankings/route.ts',
    'app/api/crags/[id]/rankings/route.ts',
    'app/api/crags/[id]/contributors/route.ts',
    'app/api/community/places/[slug]/recent-sends/route.ts',
    'app/api/community/places/[slug]/rankings/route.ts',
    'app/api/community/places/[slug]/contributors/route.ts',
    'app/api/community/places/[slug]/posts/route.ts',
    'app/api/climbs/[id]/star-rating/route.ts',
    'app/api/climbs/[id]/recent-tops/route.ts',
    'app/api/crags/search/route.ts',
    'app/api/crags/nearby/route.ts',
    'app/api/location-tags/search/route.ts',
    'app/api/places/search/route.ts',
    'app/api/places/nearby/route.ts',
  ])('keeps shared cached data anonymous in %s', (relativePath) => {
    const source = readSource(relativePath)

    expect(source).toContain('getUnauthenticatedClient')
    expect(source).not.toContain('getServerClientFromRequest')
  })

  test('keeps personalized community engagement request-bound and private', () => {
    const source = readSource('app/api/community/posts/[postId]/engagement/route.ts')

    expect(source).toContain('getServerClientFromRequest')
    expect(source).toContain('supabase.auth.getUser()')
    expect(source).not.toContain("'Cache-Control': 'public")
  })

  test('allows anonymous recent tops to use the shared CDN cache', () => {
    const source = readSource('app/api/climbs/[id]/recent-tops/route.ts')

    expect(source).toContain("'public, s-maxage=60, stale-while-revalidate=300'")
    expect(source).not.toContain("'private, no-store'")
  })
})
