import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import LogbookView from '@/components/logbook/LogbookView'
import { Card, CardContent } from '@/components/ui/card'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Lock, ArrowLeft } from 'lucide-react'
import ProfileViewTracker from './components/ProfileViewTracker'

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

interface Submission {
  id: string
  url: string
  created_at: string
  crag_name: string | null
  route_lines_count: number
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
    .select('id, url, created_at, crags(name), route_lines(count)')
    .eq('created_by', userId)
    .eq('moderation_status', 'approved')
    .not('crag_id', 'is', null)
    .not('latitude', 'is', null)
    .not('longitude', 'is', null)
    .order('created_at', { ascending: false })
    .limit(24)

  if (error || !data) {
    return []
  }

  return data
    .map((submission) => {
      const cragRelation = submission.crags as { name?: string } | Array<{ name?: string }> | null
      const cragName = Array.isArray(cragRelation)
        ? (cragRelation[0]?.name || null)
        : (cragRelation?.name || null)

      const routeLines = submission.route_lines as Array<{ count?: number }> | null
      const routeLinesCount = Array.isArray(routeLines) && routeLines[0]
        ? (routeLines[0].count || 0)
        : 0

      return {
        id: submission.id,
        url: submission.url,
        created_at: submission.created_at,
        crag_name: cragName,
        route_lines_count: routeLinesCount,
      }
    })
    .filter((submission) => submission.route_lines_count > 0)
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
          <Link href="/community">
            <Button variant="outline" className="gap-2">
              <ArrowLeft className="w-4 h-4" />
              Back to Community
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
          <Link href="/community">
            <Button variant="outline" className="gap-2">
              <ArrowLeft className="w-4 h-4" />
              Back to Community
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
    <div className="min-h-screen bg-white dark:bg-gray-950">
      <ProfileViewTracker />
      <LogbookView
        userId={userId}
        isOwnProfile={false}
        initialLogs={logs}
        profile={profile}
        initialSubmissions={submissions}
      />
    </div>
  )
}
