import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getServerClient } from '@/lib/supabase-server'
import SessionComposer from '@/app/community/components/SessionComposer'
import UpcomingFeed from '@/app/community/components/UpcomingFeed'
import UpdateComposer from '@/app/community/components/UpdateComposer'
import UpdatesFeed from '@/app/community/components/UpdatesFeed'
import TopThisPlacePanel from '@/app/community/components/TopThisPlacePanel'
import PlaceRankingsPanel from '@/app/community/components/PlaceRankingsPanel'
import { CommunitySessionPost, CommunityUpdatePost } from '@/types/community'

interface PlacePageParams {
  slug: string
}

interface PlacePageSearchParams {
  tab?: string
}

interface PlaceSummary {
  id: string
  name: string
  type: 'crag' | 'gym'
  slug: string | null
  country_code: string | null
  primary_discipline: string | null
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

interface GymFloorPlanRow {
  id: string
  gym_place_id: string
  name: string
  image_url: string
  image_width: number
  image_height: number
}

interface GymRouteRow {
  id: string
  floor_plan_id: string
  grade: string
  status: 'active' | 'retired'
}

interface GymMarkerRow {
  route_id: string
  x_norm: number
  y_norm: number
}

export async function generateMetadata({ params }: { params: Promise<PlacePageParams> }): Promise<Metadata> {
  const { slug } = await params

  return {
    title: `${slug} community | letsboulder`,
    description: 'Find climbing partners and upcoming sessions for this place.',
  }
}

export default async function CommunityPlacePage({ params, searchParams }: { params: Promise<PlacePageParams>; searchParams: Promise<PlacePageSearchParams> }) {
  const { slug } = await params
  const resolvedSearchParams = await searchParams
  const activeTab = resolvedSearchParams.tab === 'updates'
    ? 'updates'
    : resolvedSearchParams.tab === 'rankings'
      ? 'rankings'
      : 'upcoming'
  const supabase = await getServerClient()

  const { data: place } = await supabase
    .from('places')
    .select('id, name, type, slug, country_code, primary_discipline')
    .eq('slug', slug)
    .limit(1)
    .maybeSingle()

  if (!place) {
    notFound()
  }

  const typedPlace = place as PlaceSummary
  const cragPageHref = typedPlace.type === 'crag'
    ? (typedPlace.country_code && typedPlace.slug
      ? `/${typedPlace.country_code.toLowerCase()}/${typedPlace.slug}`
      : `/crag/${typedPlace.id}`)
    : null

  let sessionPosts: CommunitySessionPost[] = []
  let updatePosts: CommunityUpdatePost[] = []
  let gymFloorPlan: GymFloorPlanRow | null = null
  let gymMarkers: Array<{ id: string; grade: string; x: number; y: number }> = []

  if (typedPlace.type === 'gym') {
    const { data: floorPlan } = await supabase
      .from('gym_floor_plans')
      .select('id, gym_place_id, name, image_url, image_width, image_height')
      .eq('gym_place_id', typedPlace.id)
      .eq('is_active', true)
      .maybeSingle()

    if (floorPlan) {
      gymFloorPlan = floorPlan as GymFloorPlanRow

      const { data: routeRows } = await supabase
        .from('gym_routes')
        .select('id, floor_plan_id, grade, status')
        .eq('gym_place_id', typedPlace.id)
        .eq('floor_plan_id', gymFloorPlan.id)
        .eq('status', 'active')

      const typedRoutes = (routeRows || []) as GymRouteRow[]
      const routeIds = typedRoutes.map(route => route.id)

      if (routeIds.length > 0) {
        const { data: markerRows } = await supabase
          .from('gym_route_markers')
          .select('route_id, x_norm, y_norm')
          .in('route_id', routeIds)

        const markerMap = new Map<string, GymMarkerRow>()
        for (const marker of (markerRows || []) as GymMarkerRow[]) {
          markerMap.set(marker.route_id, marker)
        }

        gymMarkers = typedRoutes
          .map(route => {
            const marker = markerMap.get(route.id)
            if (!marker) return null

            return {
              id: route.id,
              grade: route.grade,
              x: Number(marker.x_norm),
              y: Number(marker.y_norm),
            }
          })
          .filter((value): value is { id: string; grade: string; x: number; y: number } => Boolean(value))
      }
    }
  }

  if (activeTab === 'upcoming') {
    const { data: postRows } = await supabase
      .from('community_posts')
      .select('id, author_id, place_id, type, title, body, discipline, grade_min, grade_max, start_at, end_at, created_at, updated_at')
      .eq('place_id', typedPlace.id)
      .eq('type', 'session')
      .gte('start_at', new Date().toISOString())
      .order('start_at', { ascending: true })
      .limit(100)

    const typedPosts = (postRows || []) as SessionPostRow[]
    const authorIds = Array.from(new Set(typedPosts.map(post => post.author_id)))

    const authorMap = new Map<string, ProfileRow>()
    if (authorIds.length > 0) {
      const { data: profileRows } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url')
        .in('id', authorIds)

      for (const profile of (profileRows || []) as ProfileRow[]) {
        authorMap.set(profile.id, profile)
      }
    }

    sessionPosts = typedPosts.map(post => ({
      ...post,
      author: authorMap.get(post.author_id) || null,
    }))
  }

  if (activeTab === 'updates') {
    const { data: postRows } = await supabase
      .from('community_posts')
      .select('id, author_id, place_id, type, title, body, discipline, created_at, updated_at')
      .eq('place_id', typedPlace.id)
      .in('type', ['update', 'conditions', 'question'])
      .order('created_at', { ascending: false })
      .limit(100)

    const typedPosts = (postRows || []) as UpdatePostRow[]
    const authorIds = Array.from(new Set(typedPosts.map(post => post.author_id)))

    const authorMap = new Map<string, ProfileRow>()
    if (authorIds.length > 0) {
      const { data: profileRows } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url')
        .in('id', authorIds)

      for (const profile of (profileRows || []) as ProfileRow[]) {
        authorMap.set(profile.id, profile)
      }
    }

    updatePosts = typedPosts.map(post => ({
      ...post,
      author: authorMap.get(post.author_id) || null,
    }))
  }

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950">
      <div className="container mx-auto max-w-3xl px-4 py-8">
        <header>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{typedPlace.type}</p>
          <h1 className="mt-1 text-3xl font-bold text-gray-900 dark:text-gray-100">{typedPlace.name}</h1>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            Session planning and partner requests for this place.
          </p>
        </header>

        {cragPageHref ? (
          <section className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-900">
            <Link
              href={cragPageHref}
              className="inline-flex text-sm font-semibold text-gray-900 underline-offset-2 hover:underline dark:text-gray-100"
            >
              View crag page
            </Link>
          </section>
        ) : null}

        {typedPlace.type === 'gym' && gymFloorPlan ? (
          <section className="mt-4 rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Floor plan</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">{gymMarkers.length} active routes</p>
            </div>
            <div className="relative overflow-hidden rounded-lg border border-gray-200 dark:border-gray-800">
              <Image
                src={gymFloorPlan.image_url}
                alt={gymFloorPlan.name}
                width={1600}
                height={1200}
                unoptimized
                className="block w-full h-auto"
              />
              {gymMarkers.map(marker => (
                <div
                  key={marker.id}
                  className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border border-white bg-blue-600 px-2 py-1 text-[10px] font-semibold text-white shadow"
                  style={{ left: `${marker.x * 100}%`, top: `${marker.y * 100}%` }}
                  title={marker.grade}
                >
                  {marker.grade}
                </div>
              ))}
            </div>
          </section>
        ) : null}

        <TopThisPlacePanel slug={slug} />

        <div className="mt-6 flex border-b border-gray-200 dark:border-gray-800">
          <Link
            href={`/community/places/${slug}`}
            className={`px-3 py-2 text-sm ${activeTab === 'upcoming'
              ? 'border-b-2 border-gray-900 font-semibold text-gray-900 dark:border-gray-100 dark:text-gray-100'
              : 'text-gray-500 dark:text-gray-400'}`}
          >
            Session planner
          </Link>
          <Link
            href={`/community/places/${slug}?tab=updates`}
            className={`px-3 py-2 text-sm ${activeTab === 'updates'
              ? 'border-b-2 border-gray-900 font-semibold text-gray-900 dark:border-gray-100 dark:text-gray-100'
              : 'text-gray-500 dark:text-gray-400'}`}
          >
            Updates
          </Link>
          <Link
            href={`/community/places/${slug}?tab=rankings`}
            className={`px-3 py-2 text-sm ${activeTab === 'rankings'
              ? 'border-b-2 border-gray-900 font-semibold text-gray-900 dark:border-gray-100 dark:text-gray-100'
              : 'text-gray-500 dark:text-gray-400'}`}
          >
            Rankings
          </Link>
        </div>

        {activeTab === 'upcoming' || activeTab === 'updates' ? (
          <div className="mt-4">
            {activeTab === 'upcoming' ? <SessionComposer placeId={typedPlace.id} /> : <UpdateComposer placeId={typedPlace.id} />}
          </div>
        ) : null}

        <div className="mt-4">
          {activeTab === 'upcoming'
            ? <UpcomingFeed posts={sessionPosts} />
            : activeTab === 'updates'
              ? <UpdatesFeed posts={updatePosts} />
              : <PlaceRankingsPanel slug={slug} />}
        </div>
      </div>
    </div>
  )
}
