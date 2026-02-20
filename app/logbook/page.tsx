'use client'

import { useEffect, useState, Suspense } from 'react'
import { createClient } from '@/lib/supabase'
import type { User } from '@supabase/supabase-js'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import LogbookView from '@/components/logbook/LogbookView'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { LogbookSkeleton } from '@/components/logbook/logbook-states'
import { useToast } from '@/components/logbook/toast'
import { getGradePoints } from '@/lib/grades'

interface LoggedClimb {
  id: string
  climb_id: string
  style: string
  created_at: string
  points?: number
  climbs: {
    id: string
    name: string
    grade: string
    image_url?: string
    crags: {
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
}

interface Submission {
  id: string
  url: string
  created_at: string
  crag_name: string | null
  route_lines_count: number
}

function LoadingFallback() {
  return (
    <div className="min-h-screen bg-white dark:bg-gray-950">
      <LogbookSkeleton variant="own" />
    </div>
  )
}

export default function LogbookPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <LogbookContent />
    </Suspense>
  )
}

function LogbookContent() {
  const [user, setUser] = useState<User | null>(null)
  const [logs, setLogs] = useState<LoggedClimb[]>([])
  const [profile, setProfile] = useState<Profile | null>(null)
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [loading, setLoading] = useState(true)
  const searchParams = useSearchParams()
  const { addToast } = useToast()

  useEffect(() => {
    const checkUser = async () => {
      try {
        const supabase = createClient()
        const { data: { user }, error: userError } = await supabase.auth.getUser()

        if (userError) {
          console.error('Auth error:', userError)
          if (userError.name === 'AuthSessionMissingError' || userError.message.includes('session')) {
            setLoading(false)
            return
          }
        }

        setUser(user)

        if (user) {
          const { data: profileData, error: profileError } = await supabase
            .from('profiles')
            .select('id, username, display_name, avatar_url, bio, total_climbs, total_points, highest_grade')
            .eq('id', user.id)
            .single()

          if (!profileError && profileData) {
            setProfile(profileData)
          }

          const { data: logsData, error: logsError } = await supabase
            .from('user_climbs')
            .select('*, climbs(id, name, grade, route_lines!inner(images!inner(url, crags!inner(name))))')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })

          if (logsError) {
            console.error('Logs query error:', logsError)
          }

          const cragsByClimbId: Record<string, string> = {}
          const logsWithCrags = (logsData || []).map((log) => {
            const routeLines = log.climbs?.route_lines as Array<{ images?: { url?: string; crags?: { name: string } } }> | undefined
            const cragName = routeLines?.[0]?.images?.crags?.name || 'Unknown crag'
            const imageUrl = routeLines?.[0]?.images?.url
            cragsByClimbId[log.climb_id] = cragName
            return {
              ...log,
              climbs: {
                ...log.climbs,
                image_url: imageUrl,
                crags: { name: cragName }
              }
            }
          })

          const logsWithPoints = logsWithCrags.map((log) => ({
            ...log,
            points: log.style === 'flash'
              ? getGradePoints(log.climbs?.grade) + 10
              : getGradePoints(log.climbs?.grade)
          }))

          setLogs(logsWithPoints)

          const { data: imageSubmissions, error: submissionsError } = await supabase
            .from('images')
            .select('id, url, created_at, crags(name), route_lines(count)')
            .eq('created_by', user.id)
            .eq('moderation_status', 'approved')
            .not('crag_id', 'is', null)
            .not('latitude', 'is', null)
            .not('longitude', 'is', null)
            .order('created_at', { ascending: false })
            .limit(24)

          if (submissionsError) {
            console.error('Submissions query error:', submissionsError)
          }

          const formattedSubmissions: Submission[] = (imageSubmissions || [])
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

          setSubmissions(formattedSubmissions)
        }
      } catch (err) {
        console.error('Unexpected error checking auth:', err)
      } finally {
        setLoading(false)
      }
    }
    checkUser()
  }, [])

  useEffect(() => {
    if (searchParams.get('success')) {
      addToast('Payment successful! You are now a Pro member.', 'success')
    }
    if (searchParams.get('canceled')) {
      addToast('Payment canceled. No worries, try again when ready!', 'info')
    }
  }, [searchParams, addToast])

  if (loading) {
    return (
      <div className="min-h-screen bg-white dark:bg-gray-950">
        <LogbookSkeleton variant="own" />
      </div>
    )
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-white dark:bg-gray-950 px-4 py-8">
        <Card className="max-w-sm mx-auto">
          <CardContent className="pt-6">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4">
              My Climbing Logbook
            </h1>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              Please login to view your logbook.
            </p>
            <Link href="/auth">
              <Button>Login</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <LogbookView
      userId={user.id}
      isOwnProfile={true}
      initialLogs={logs}
      profile={profile || undefined}
      initialSubmissions={submissions}
    />
  )
}
