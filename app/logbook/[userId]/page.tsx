import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import LogbookView from '@/components/logbook/LogbookView'
import { Card, CardContent } from '@/components/ui/card'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Lock, ArrowLeft } from 'lucide-react'
import ProfileViewTracker from './components/ProfileViewTracker'
import type { Submission } from '@/types/submissions'
import { groupSubmittedImages } from '@/lib/submissions/group-submitted-images'

interface PublicContributionRow {
  id: string
  url: string
  created_at: string
  submission_id: string | null
  is_anonymous_submission: boolean | null
  contribution_credit_platform: string | null
  contribution_credit_handle: string | null
  crags: { name?: string } | Array<{ name?: string }> | null
  route_lines: Array<{ count?: number }> | null
}

interface CragImageLinkRow {
  source_image_id: string | null
  linked_image_id: string | null
}

interface PublicLogbookPageProps {
  params: Promise<{ userId: string }>
}

interface Climb {
  id: string
  climb_id: string
  style: string
  created_at: string
  notes?: string
  date_climbed?: string
  climbs: {
    id: string
    name: string
    grade: string
    image_url?: string
    crags?: {
      name: string
    }
  }
}

interface Profile {
  id: string
  username: string
  display_name?: string
  avatar_url?: string
  bio?: string
  total_climbs?: number
  total_points?: number
  highest_grade?: string
  is_public?: boolean
  first_name?: string
  last_name?: string
}

async function getProfile(userId: string): Promise<Profile | null> {
  const cookieStore = await cookies()
  
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll() {},
      },
    }
  )

  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, display_name, avatar_url, bio, total_climbs, total_points, highest_grade, is_public, first_name, last_name')
    .eq('id', userId)
    .single()

  if (error || !data) {
    return null
  }

  return data as Profile
}

async function getPublicLogs(userId: string): Promise<Climb[]> {
  const cookieStore = await cookies()
  
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll() {},
      },
    }
  )

  const { data: logsData, error: logsError } = await supabase
    .from('user_climbs')
    .select('*, climbs(id, name, grade, route_lines!inner(images!inner(url, crags!inner(name))))')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (logsError || !logsData) {
    return []
  }

  const logsWithCrags = logsData.map((log) => {
    const routeLines = log.climbs?.route_lines as Array<{ images?: { url?: string; crags?: { name: string } } }> | undefined
    return {
      ...log,
      climbs: {
        ...log.climbs,
        image_url: routeLines?.[0]?.images?.url,
        crags: {
          name: routeLines?.[0]?.images?.crags?.name || 'Unknown crag'
        }
      }
    }
  }) as Climb[]

  return logsWithCrags
}

async function getPublicSubmissions(userId: string): Promise<Submission[]> {
  const cookieStore = await cookies()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll() {},
      },
    }
  )

  const { data, error } = await supabase
    .from('images')
    .select('id, url, created_at, submission_id, is_anonymous_submission, contribution_credit_platform, contribution_credit_handle, crags(name), route_lines(count)')
    .eq('created_by', userId)
    .eq('is_anonymous_submission', false)
    .eq('moderation_status', 'approved')
    .not('crag_id', 'is', null)
    .not('latitude', 'is', null)
    .not('longitude', 'is', null)
    .order('created_at', { ascending: false })
    .limit(24)

  if (error || !data) {
    return []
  }

  const contributionRows = data as PublicContributionRow[]
  const imageIds = contributionRows.map((row) => row.id)

  let links: CragImageLinkRow[] = []
  if (imageIds.length > 0) {
    const idsCsv = imageIds.join(',')
    const { data: linksData, error: linksError } = await supabase
      .from('crag_images')
      .select('source_image_id, linked_image_id')
      .or(`linked_image_id.in.(${idsCsv}),source_image_id.in.(${idsCsv})`)

    if (!linksError) {
      links = (linksData || []) as CragImageLinkRow[]
    }
  }

  return groupSubmittedImages(contributionRows, links)
}

function PrivateProfileCard({ username }: { username: string }) {
  return (
    <div className="min-h-screen bg-white dark:bg-gray-950 px-4 py-8">
      <Card className="max-w-sm mx-auto">
        <CardContent className="flex flex-col items-center justify-center py-12 px-4">
          <div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-4">
            <Lock className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
            Private Profile
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 text-center mb-6 max-w-sm">
            {username} has chosen to keep their logbook hidden from public view.
          </p>
          <Link href="/">
            <Button variant="outline" className="gap-2">
              <ArrowLeft className="w-4 h-4" />
              Back to Map
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  )
}

function ProfileNotFound() {
  return (
    <div className="min-h-screen bg-white dark:bg-gray-950 px-4 py-8">
      <Card className="max-w-sm mx-auto">
        <CardContent className="flex flex-col items-center justify-center py-12 px-4">
          <div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-4">
            <Lock className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
            Profile Not Found
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 text-center mb-6 max-w-sm">
            This climber&apos;s profile could not be found.
          </p>
          <Link href="/">
            <Button variant="outline" className="gap-2">
              <ArrowLeft className="w-4 h-4" />
              Back to Map
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  )
}

export async function generateMetadata({ params }: PublicLogbookPageProps) {
  const { userId } = await params
  const profile = await getProfile(userId)

  if (!profile) {
    return {
      title: 'Profile Not Found',
    }
  }

  return {
    title: `${profile.username}'s Logbook`,
    description: `View ${profile.username}'s climbing logbook and achievements on letsboulder.`,
    alternates: {
      canonical: `/logbook/${userId}`,
    },
    openGraph: {
      title: `${profile.username}'s Logbook - letsboulder`,
      description: `View ${profile.username}'s climbing logbook and achievements on letsboulder.`,
      url: `/logbook/${userId}`,
    },
  }
}

export default async function PublicLogbookPage({ params }: PublicLogbookPageProps) {
  const { userId } = await params
  const profile = await getProfile(userId)

  if (!profile) {
    return <ProfileNotFound />
  }

  if (profile.is_public === false) {
    return <PrivateProfileCard username={profile.username} />
  }

  const logs = await getPublicLogs(userId)
  const submissions = await getPublicSubmissions(userId)

  return (
    <>
      <ProfileViewTracker />
      <LogbookView
        userId={userId}
        isOwnProfile={false}
        initialLogs={logs}
        profile={profile}
        initialSubmissions={submissions}
      />
    </>
  )
}
