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
import { getSignedUrlBatchKey, type SignedUrlBatchResponse } from '@/lib/signed-url-batch'
import { csrfFetch } from '@/hooks/useCsrf'

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
  kind: 'submitted' | 'draft'
  url: string
  created_at: string
  updated_at: string
  crag_name: string | null
  route_lines_count: number
  contribution_credit_platform: string | null
  contribution_credit_handle: string | null
}

interface DraftImageRef {
  storage_bucket?: string
  storage_path?: string
  route_data?: unknown
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
            .select('id, url, created_at, contribution_credit_platform, contribution_credit_handle, crags(name), route_lines(count)')
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
                kind: 'submitted' as const,
                url: submission.url,
                created_at: submission.created_at,
                updated_at: submission.created_at,
                crag_name: cragName,
                route_lines_count: routeLinesCount,
                contribution_credit_platform: submission.contribution_credit_platform || null,
                contribution_credit_handle: submission.contribution_credit_handle || null,
              }
            })
            .filter((submission) => submission.route_lines_count > 0)

          const { data: draftSubmissions, error: draftError } = await supabase
            .from('submission_drafts')
            .select('id, created_at, updated_at, crags(name), submission_draft_images(storage_bucket, storage_path, route_data)')
            .eq('user_id', user.id)
            .eq('status', 'draft')
            .order('updated_at', { ascending: false })
            .limit(24)

          if (draftError) {
            console.error('Draft submissions query error:', draftError)
          }

          const draftRows = (draftSubmissions || [])
          const firstDraftImageObjects = draftRows
            .map((draft) => {
              const draftImages = (draft.submission_draft_images as DraftImageRef[] | null) || []
              const firstImage = draftImages[0]
              if (!firstImage?.storage_bucket || !firstImage?.storage_path) return null
              return {
                bucket: firstImage.storage_bucket,
                path: firstImage.storage_path,
              }
            })
            .filter((item): item is { bucket: string; path: string } => !!item)

          const signedByKey = new Map<string, string>()
          if (firstDraftImageObjects.length > 0) {
            const signedUrlResponse = await csrfFetch('/api/uploads/signed-urls/batch', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ objects: firstDraftImageObjects }),
            })

            if (signedUrlResponse.ok) {
              const signedData = await signedUrlResponse.json().catch(() => ({} as SignedUrlBatchResponse))
              for (const item of signedData.results || []) {
                if (!item?.signedUrl) continue
                signedByKey.set(getSignedUrlBatchKey(item.bucket, item.path), item.signedUrl)
              }
            }
          }

          const formattedDrafts: Submission[] = draftRows.map((draft) => {
            const cragRelation = draft.crags as { name?: string } | Array<{ name?: string }> | null
            const cragName = Array.isArray(cragRelation)
              ? (cragRelation[0]?.name || null)
              : (cragRelation?.name || null)

            const draftImages = (draft.submission_draft_images as DraftImageRef[] | null) || []

            const firstImage = draftImages[0]
            const previewUrl = firstImage?.storage_bucket && firstImage?.storage_path
              ? (signedByKey.get(getSignedUrlBatchKey(firstImage.storage_bucket, firstImage.storage_path)) || '')
              : ''

            const routeCount = draftImages.reduce((count, image) => {
              const routeData = image.route_data
              if (routeData && typeof routeData === 'object' && 'completedRoutes' in (routeData as Record<string, unknown>)) {
                const completedRoutes = (routeData as { completedRoutes?: unknown[] }).completedRoutes
                return count + (Array.isArray(completedRoutes) ? completedRoutes.length : 0)
              }
              return count
            }, 0)

            return {
              id: draft.id,
              kind: 'draft' as const,
              url: previewUrl,
              created_at: draft.created_at,
              updated_at: draft.updated_at,
              crag_name: cragName,
              route_lines_count: routeCount,
              contribution_credit_platform: null,
              contribution_credit_handle: null,
            }
          })

          const mergedSubmissions = [...formattedDrafts, ...formattedSubmissions]
            .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())

          setSubmissions(mergedSubmissions)
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
