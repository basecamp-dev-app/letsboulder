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

function LoadingFallback() {
  return (
    <div className="container mx-auto px-4 py-8">
      <LogbookSkeleton />
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
            .select('*, climbs(id, name, grade)')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })

          if (logsError) {
            console.error('Logs query error:', logsError)
          }

          const climbIds = logsData?.map(log => log.climb_id).filter(Boolean) || []

          const cragsByClimbId: Record<string, string> = {}
          if (climbIds.length > 0) {
            const { data: routeLinesData } = await supabase
              .from('route_lines')
              .select('climb_id, images!inner(crags!inner(name))')
              .in('climb_id', climbIds)

            if (routeLinesData) {
              routeLinesData.forEach((rl) => {
                const images = rl as { climb_id?: string; images?: { crags?: { name: string } } }
                if (images.climb_id && images.images?.crags?.name) {
                  cragsByClimbId[images.climb_id] = images.images.crags.name
                }
              })
            }
          }

          const logsWithPoints = logsData?.map((log) => ({
            ...log,
            climbs: {
              ...log.climbs,
              crags: {
                name: cragsByClimbId[log.climb_id] || 'Unknown crag'
              }
            },
            points: log.style === 'flash'
              ? (log.climbs?.grade ? getGradePoints(log.climbs.grade) + 10 : 0)
              : (log.climbs?.grade ? getGradePoints(log.climbs.grade) : 0)
          })) || []

          setLogs(logsWithPoints)
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
      <div className="container mx-auto px-4 py-8">
        <LogbookSkeleton />
      </div>
    )
  }

  if (!user) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Card>
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
    />
  )
}

function getGradePoints(grade: string): number {
  const gradeToPointsMap: Record<string, number> = {
    '1A': 100, '1A+': 116, '1B': 132, '1B+': 148, '1C': 164, '1C+': 180,
    '2A': 196, '2A+': 212, '2B': 228, '2B+': 244, '2C': 260, '2C+': 276,
    '3A': 292, '3A+': 308, '3B': 324, '3B+': 340, '3C': 356, '3C+': 372,
    '4A': 388, '4A+': 404, '4B': 420, '4B+': 436, '4C': 452, '4C+': 468,
    '5A': 484, '5A+': 500, '5B': 516, '5B+': 532, '5C': 548, '5C+': 564,
    '6A': 580, '6A+': 596, '6B': 612, '6B+': 628, '6C': 644, '6C+': 660,
    '7A': 676, '7A+': 692, '7B': 708, '7B+': 724, '7C': 740, '7C+': 756,
    '8A': 772, '8A+': 788, '8B': 804, '8B+': 820, '8C': 836, '8C+': 852,
    '9A': 868, '9A+': 884, '9B': 900, '9B+': 916, '9C': 932, '9C+': 948,
  }
  return gradeToPointsMap[grade] || 0
}
