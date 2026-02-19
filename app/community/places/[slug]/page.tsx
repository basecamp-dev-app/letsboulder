import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getServerClient } from '@/lib/supabase-server'
import SessionComposer from '@/app/community/components/SessionComposer'
import UpcomingFeed from '@/app/community/components/UpcomingFeed'
import UpdateComposer from '@/app/community/components/UpdateComposer'
import UpdatesFeed from '@/app/community/components/UpdatesFeed'
import TopThisPlacePanel from '@/app/community/components/TopThisPlacePanel'
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
  const activeTab = resolvedSearchParams.tab === 'updates' ? 'updates' : 'upcoming'
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

  let sessionPosts: CommunitySessionPost[] = []
  let updatePosts: CommunityUpdatePost[] = []

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
            Upcoming sessions and partner requests for this place.
          </p>
        </header>

        <TopThisPlacePanel slug={slug} />

        <div className="mt-6 flex border-b border-gray-200 dark:border-gray-800">
          <Link
            href={`/community/places/${slug}`}
            className={`px-3 py-2 text-sm ${activeTab === 'upcoming'
              ? 'border-b-2 border-gray-900 font-semibold text-gray-900 dark:border-gray-100 dark:text-gray-100'
              : 'text-gray-500 dark:text-gray-400'}`}
          >
            Upcoming
          </Link>
          <Link
            href={`/community/places/${slug}?tab=updates`}
            className={`px-3 py-2 text-sm ${activeTab === 'updates'
              ? 'border-b-2 border-gray-900 font-semibold text-gray-900 dark:border-gray-100 dark:text-gray-100'
              : 'text-gray-500 dark:text-gray-400'}`}
          >
            Updates
          </Link>
        </div>

        <div className="mt-4">
          {activeTab === 'upcoming' ? <SessionComposer placeId={typedPlace.id} /> : <UpdateComposer placeId={typedPlace.id} />}
        </div>

        <div className="mt-4">
          {activeTab === 'upcoming' ? <UpcomingFeed posts={sessionPosts} /> : <UpdatesFeed posts={updatePosts} />}
        </div>
      </div>
    </div>
  )
}
