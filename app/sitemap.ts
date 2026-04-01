import type { MetadataRoute } from 'next'
import { createServerClient } from '@supabase/ssr'
import { SITE_URL } from '@/lib/site'
import { serverEnv } from '@/lib/env'

export const revalidate = 3600

interface SitemapCragRow {
  slug: string | null
  country_code: string | null
  updated_at: string | null
}

interface SitemapClimbRow {
  slug: string | null
  updated_at: string | null
  crags:
    | {
        slug: string | null
        country_code: string | null
      }
    | Array<{
        slug: string | null
        country_code: string | null
      }>
    | null
}

function getSupabase() {
  return createServerClient(
    serverEnv.NEXT_PUBLIC_SUPABASE_URL,
    serverEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { cookies: { getAll() { return [] }, setAll() {} } }
  )
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const supabase = getSupabase()

  const [cragResult, climbResult] = await Promise.all([
    supabase
      .from('crags')
      .select('slug, country_code, updated_at')
      .not('slug', 'is', null)
      .neq('slug', '')
      .not('country_code', 'is', null)
      .neq('country_code', '')
      .order('updated_at', { ascending: false }),
    supabase
      .from('climbs')
      .select('slug, updated_at, crags!inner(slug, country_code)')
      .not('slug', 'is', null)
      .neq('slug', '')
      .in('status', ['active', 'approved'])
      .order('updated_at', { ascending: false }),
  ])

  const now = new Date()

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: SITE_URL, lastModified: now },
    { url: `${SITE_URL}/about`, lastModified: now },
    { url: `${SITE_URL}/bouldering-map`, lastModified: now },
    { url: `${SITE_URL}/climbing-map`, lastModified: now },
    { url: `${SITE_URL}/rock-climbing-map`, lastModified: now },
    { url: `${SITE_URL}/guernsey-bouldering`, lastModified: now },
    { url: `${SITE_URL}/privacy`, lastModified: now },
    { url: `${SITE_URL}/terms`, lastModified: now },
  ]

  const cragRoutes: MetadataRoute.Sitemap = ((cragResult.data || []) as SitemapCragRow[])
    .filter((crag) => crag.slug && crag.country_code)
    .map((crag) => ({
      url: `${SITE_URL}/${String(crag.country_code).toLowerCase()}/${crag.slug}`,
      lastModified: crag.updated_at ? new Date(crag.updated_at) : now,
    }))

  const climbRoutes = ((climbResult.data || []) as SitemapClimbRow[])
    .map((climb) => {
      const crag = Array.isArray(climb.crags) ? climb.crags[0] : climb.crags
      if (!climb.slug || !crag?.slug || !crag.country_code) return null

      return {
        url: `${SITE_URL}/${String(crag.country_code).toLowerCase()}/${crag.slug}/${climb.slug}`,
        lastModified: climb.updated_at ? new Date(climb.updated_at) : now,
      }
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)

  return [...staticRoutes, ...cragRoutes, ...climbRoutes]
}
