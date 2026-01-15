import { MetadataRoute } from 'next'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = 'https://gsyrocks.com'
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } }
  )

  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 1,
    },
    {
      url: `${baseUrl}/about`,
      lastModified: new Date(),
      changeFrequency: 'yearly',
      priority: 0.6,
    },
    {
      url: `${baseUrl}/leaderboard`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: `${baseUrl}/map`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    {
      url: `${baseUrl}/name-routes`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.5,
    },
    {
      url: `${baseUrl}/privacy`,
      lastModified: new Date(),
      changeFrequency: 'yearly',
      priority: 0.4,
    },
    {
      url: `${baseUrl}/terms`,
      lastModified: new Date(),
      changeFrequency: 'yearly',
      priority: 0.4,
    },
    {
      url: `${baseUrl}/upload-climb`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: `${baseUrl}/logbook`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.6,
    },
    {
      url: `${baseUrl}/settings`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.4,
    },
    {
      url: `${baseUrl}/auth`,
      lastModified: new Date(),
      changeFrequency: 'yearly',
      priority: 0.3,
    },
  ]

  const [cragsResult, climbsResult, imagesResult] = await Promise.all([
    supabase.from('crags').select('id, updated_at').eq('is_active', true).limit(1000),
    supabase.from('climbs').select('id, updated_at').eq('status', 'active').limit(1000),
    supabase.from('images').select('id, updated_at').eq('is_verified', true).limit(1000),
  ])

  const dynamicRoutes: MetadataRoute.Sitemap = [
    ...(cragsResult.data || []).map((crag) => ({
      url: `${baseUrl}/crag/${crag.id}`,
      lastModified: new Date(crag.updated_at || Date.now()),
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    })),
    ...(climbsResult.data || []).map((climb) => ({
      url: `${baseUrl}/climb/${climb.id}`,
      lastModified: new Date(climb.updated_at || Date.now()),
      changeFrequency: 'weekly' as const,
      priority: 0.6,
    })),
    ...(imagesResult.data || []).map((image) => ({
      url: `${baseUrl}/image/${image.id}`,
      lastModified: new Date(image.updated_at || Date.now()),
      changeFrequency: 'monthly' as const,
      priority: 0.5,
    })),
  ]

  return [...staticRoutes, ...dynamicRoutes]
}
