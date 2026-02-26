import type { Metadata } from 'next'
import { createServerClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'
import { notFound } from 'next/navigation'
import { cache } from 'react'
import CragPageClient from '@/app/crag/components/CragPageClient'
import type { Crag } from '@/app/crag/components/CragPageClient'
import type { CommunitySessionPost, CommunityUpdatePost } from '@/types/community'

export const revalidate = 60

interface CragSlugParams {
  country: string
  crag: string
}

interface SessionPostRow {
  id: string
  author_id: string
  place_id: string
  type: 'session'
  title: string | null
  body: string
  discipline: string | null
  grade_min: string | null
  grade_max: string | null
  start_at: string
  end_at: string | null
  created_at: string
  updated_at: string
}

interface UpdatePostRow {
  id: string
  author_id: string
  place_id: string
  type: 'update' | 'conditions' | 'question'
  title: string | null
  body: string
  discipline: string | null
  created_at: string
  updated_at: string
}

interface ProfileRow {
  id: string
  username: string | null
  display_name: string | null
  avatar_url: string | null
}

interface CragSlugRow {
  id: string
  name: string
  slug: string | null
  country_code: string | null
  region_name: string | null
  country: string | null
  latitude: number | null
  longitude: number | null
  region_id: string | null
  description: string | null
  access_notes: string | null
  rock_type: string | null
  type: string | null
  regions: { id: string; name: string } | Array<{ id: string; name: string }> | null
}

async function getSupabase() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return [] }, setAll() {} } }
  )
}

const getCragByCountrySlug = cache(async (countryCode: string, cragSlug: string): Promise<CragSlugRow | null> => {
  const supabase = await getSupabase()
  const { data } = await supabase
    .from('crags')
    .select(`
      id,
      name,
      slug,
      country_code,
      region_name,
      country,
      latitude,
      longitude,
      region_id,
      description,
      access_notes,
      rock_type,
      type,
      regions:region_id (id, name)
    `)
    .eq('country_code', countryCode)
    .eq('slug', cragSlug)
    .maybeSingle()

  return (data as CragSlugRow | null) || null
})

async function loadCragCommunityData(supabase: SupabaseClient, placeId: string) {
  const { data: place } = await supabase
    .from('places')
    .select('id, slug')
    .eq('id', placeId)
    .eq('type', 'crag')
    .maybeSingle()

  const [{ data: sessionRows }, { data: updateRows }] = await Promise.all([
    supabase
      .from('community_posts')
      .select('id, author_id, place_id, type, title, body, discipline, grade_min, grade_max, start_at, end_at, created_at, updated_at')
      .eq('place_id', placeId)
      .eq('type', 'session')
      .gte('start_at', new Date().toISOString())
      .order('start_at', { ascending: true })
      .limit(100),
    supabase
      .from('community_posts')
      .select('id, author_id, place_id, type, title, body, discipline, created_at, updated_at')
      .eq('place_id', placeId)
      .in('type', ['update', 'conditions', 'question'])
      .order('created_at', { ascending: false })
      .limit(100),
  ])

  const typedSessionRows = (sessionRows || []) as SessionPostRow[]
  const typedUpdateRows = (updateRows || []) as UpdatePostRow[]
  const authorIds = Array.from(new Set([
    ...typedSessionRows.map((post) => post.author_id),
    ...typedUpdateRows.map((post) => post.author_id),
  ]))

  const profileMap = new Map<string, ProfileRow>()
  if (authorIds.length > 0) {
    const { data: profileRows } = await supabase
      .from('profiles')
      .select('id, username, display_name, avatar_url')
      .in('id', authorIds)

    for (const row of (profileRows || []) as ProfileRow[]) {
      profileMap.set(row.id, row)
    }
  }

  const sessionPosts: CommunitySessionPost[] = typedSessionRows.map((post) => ({
    ...post,
    author: profileMap.get(post.author_id) || null,
  }))
  const updatePosts: CommunityUpdatePost[] = typedUpdateRows.map((post) => ({
    ...post,
    author: profileMap.get(post.author_id) || null,
  }))

  return {
    placeId: place?.id || placeId,
    placeSlug: place?.slug || null,
    sessionPosts,
    updatePosts,
  }
}

export async function generateMetadata({ params }: { params: Promise<CragSlugParams> }): Promise<Metadata> {
  const { country, crag: cragSlug } = await params
  if (!country || country.length !== 2) return {}

  const crag = await getCragByCountrySlug(country.toUpperCase(), cragSlug)

  if (!crag) return { title: 'Crag Not Found' }

  const locationParts = [crag.region_name, crag.country].filter(Boolean) as string[]
  const title = locationParts.length > 0 ? `${crag.name}, ${locationParts[0]}` : `${crag.name}`
  const locationSuffix = locationParts.length > 0 ? ` in ${locationParts.join(', ')}` : ''
  const canonicalPath = `/${country.toLowerCase()}/${cragSlug}`
  const ogImagePath = `${canonicalPath}/opengraph-image`

  return {
    title,
    description: `View climbing routes at ${crag.name}${locationSuffix}. Discover photo topos, beta, access info, and nearby climbs.`,
    robots: {
      index: country.toLowerCase() === 'gg',
      follow: true,
    },
    alternates: {
      canonical: canonicalPath,
    },
    openGraph: {
      title: `${title} | letsboulder`,
      description: `View climbing routes at ${crag.name}${locationSuffix}.`,
      url: canonicalPath,
      images: [
        {
          url: ogImagePath,
          width: 1200,
          height: 630,
          alt: `Climbing at ${crag.name}`,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: `${title} | letsboulder`,
      description: `View climbing routes at ${crag.name}${locationSuffix}.`,
      images: [ogImagePath],
    },
  }
}

export default async function CragSlugPage({ params }: { params: Promise<CragSlugParams> }) {
  const { country, crag: cragSlug } = await params
  if (!country || country.length !== 2) notFound()

  const countryCode = country.toUpperCase()
  const crag = await getCragByCountrySlug(countryCode, cragSlug)
  if (!crag) notFound()

  const supabase = await getSupabase()

  const initialCrag: Crag = {
    ...crag,
    regions: Array.isArray(crag.regions) ? crag.regions[0] : crag.regions || undefined,
  }

  const communityData = await loadCragCommunityData(supabase, crag.id)

  return (
    <>
      <CragPageClient
        id={crag.id}
        initialCrag={initialCrag}
        canonicalPath={`/${country.toLowerCase()}/${cragSlug}`}
        communityPlaceId={communityData.placeId}
        communityPlaceSlug={communityData.placeSlug}
        initialSessionPosts={communityData.sessionPosts}
        initialUpdatePosts={communityData.updatePosts}
      />
    </>
  )
}
