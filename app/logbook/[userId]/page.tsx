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
    .select('*, climbs(id, name, grade)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (logsError || !logsData) {
    return []
  }

  const climbIds = logsData.map(log => log.climb_id).filter(Boolean)

  const cragsByClimbId: Record<string, string> = {}
  if (climbIds.length > 0) {
    const { data: routeLinesData } = await supabase
      .from('route_lines')
      .select('climb_id, images!inner(crags!inner(name))')
      .in('climb_id', climbIds)

    if (routeLinesData) {
      routeLinesData.forEach((rl) => {
        const images = rl.images as { crags?: { name: string } } | undefined
        if (rl.climb_id && images?.crags?.name) {
          cragsByClimbId[rl.climb_id] = images.crags.name
        }
      })
    }
  }

  const logsWithCrags = logsData.map((log) => ({
    ...log,
    climbs: {
      ...log.climbs,
      crags: {
        name: cragsByClimbId[log.climb_id] || 'Unknown crag'
      }
    }
  })) as Climb[]

  return logsWithCrags
}

function PrivateProfileCard({ username }: { username: string }) {
  return (
    <div className="container mx-auto px-4 py-8">
      <Card className="max-w-md mx-auto">
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
          <Link href="/leaderboard">
            <Button variant="outline" className="gap-2">
              <ArrowLeft className="w-4 h-4" />
              Back to Leaderboard
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  )
}

function ProfileNotFound() {
  return (
    <div className="container mx-auto px-4 py-8">
      <Card className="max-w-md mx-auto">
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
          <Link href="/leaderboard">
            <Button variant="outline" className="gap-2">
              <ArrowLeft className="w-4 h-4" />
              Back to Leaderboard
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
      title: 'Profile Not Found - gsyrocks',
    }
  }

  return {
    title: `${profile.username}'s Logbook - gsyrocks`,
    description: `View ${profile.username}'s climbing logbook and achievements on gsyrocks.`,
    openGraph: {
      title: `${profile.username}'s Logbook - gsyrocks`,
      description: `View ${profile.username}'s climbing logbook and achievements on gsyrocks.`,
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

  return (
    <>
      <ProfileViewTracker />
      <LogbookView
        userId={userId}
        isOwnProfile={false}
        initialLogs={logs}
        profile={profile}
      />
    </>
  )
}
