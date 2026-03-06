'use client'

import { useState, useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { createClient } from '@/lib/supabase'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import GradePyramid from '@/components/GradePyramid'
import { calculateStats, getLowestGrade, getGradeFromPoints, type LogEntry } from '@/lib/grades'
import { Trash2, Loader2 } from 'lucide-react'
import { ToastContainer, useToast } from '@/components/logbook/toast'
import { EmptyLogbook } from '@/components/logbook/logbook-states'
import { csrfFetch } from '@/hooks/useCsrf'
import { useGradeSystem } from '@/hooks/useGradeSystem'
import { formatGradeForDisplay } from '@/lib/grade-display'
import { resolveRouteImageUrl } from '@/lib/route-image-url'
import SubmissionList from '@/components/submissions/SubmissionList'
import { fetchOwnSubmissions } from '@/lib/submissions/fetch-own-submissions'
import { ownLogbookQueryKey, type OwnLogbookData } from '@/lib/logbook/queries'
import type { Submission } from '@/types/submissions'

const GradeHistoryChart = dynamic(() => import('@/components/GradeHistoryChart'), {
  ssr: false,
  loading: () => <div className="h-64 flex items-center justify-center text-gray-400">Loading chart...</div>
})

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
    } | null
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
  first_name?: string
  last_name?: string
}

interface LogbookViewProps {
  userId: string
  isOwnProfile: boolean
  initialLogs?: Climb[]
  profile?: Profile
  initialSubmissions?: Submission[]
}

type OwnerSubmissionsTab = 'all' | 'drafts' | 'pending-review' | 'published'

export default function LogbookView({ userId, isOwnProfile, initialLogs = [], profile, initialSubmissions = [] }: LogbookViewProps) {
  const gradeSystem = useGradeSystem()
  const router = useRouter()
  const queryClient = useQueryClient()
  const [logs, setLogs] = useState<Climb[]>(initialLogs)
  const [submissions, setSubmissions] = useState<Submission[]>(initialSubmissions)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deletingDraftId, setDeletingDraftId] = useState<string | null>(null)
  const [publishingDraftId, setPublishingDraftId] = useState<string | null>(null)
  const [ownerSubmissionTab, setOwnerSubmissionTab] = useState<OwnerSubmissionsTab>('all')
  const { toasts, addToast, removeToast } = useToast()

  const stats = useMemo(() => {
    if (logs.length === 0) return null
    return calculateStats(logs)
  }, [logs])
  const lowestGrade = stats ? getLowestGrade(stats.gradePyramid) : '6A'

  const recentLogs = useMemo(() => logs.slice(0, 20), [logs])

  const syncOwnLogbookCache = (updater: (current: OwnLogbookData) => OwnLogbookData) => {
    if (!isOwnProfile) return

    queryClient.setQueryData<OwnLogbookData>(ownLogbookQueryKey, (current) => {
      if (!current) return current
      return updater(current)
    })
  }

  const handleDeleteLog = async (logId: string) => {
    setDeletingId(logId)
    try {
      const response = await csrfFetch(`/api/logs/${logId}`, { method: 'DELETE' })
      if (!response.ok) throw new Error()

      const updatedLogs = logs.filter(log => log.id !== logId)
      setLogs(updatedLogs)
      syncOwnLogbookCache((current) => ({
        ...current,
        logs: current.logs.filter((log) => log.id !== logId),
      }))
      addToast('Climb removed from logbook', 'success')
    } catch {
      addToast('Failed to remove climb', 'error')
    } finally {
      setDeletingId(null)
    }
  }

  const handleDeleteDraft = async (draftId: string) => {
    setDeletingDraftId(draftId)
    try {
      const response = await csrfFetch(`/api/submissions/drafts/${draftId}`, { method: 'DELETE' })
      if (!response.ok) throw new Error()

      setSubmissions((previous) => previous.filter((submission) => submission.id !== draftId))
      syncOwnLogbookCache((current) => ({
        ...current,
        submissions: current.submissions.filter((submission) => submission.id !== draftId),
      }))
      addToast('Draft deleted', 'success')
    } catch {
      addToast('Failed to delete draft', 'error')
    } finally {
      setDeletingDraftId(null)
    }
  }

  const handlePublishDraft = async (draftId: string) => {
    setPublishingDraftId(draftId)
    try {
      const response = await csrfFetch(`/api/submissions/drafts/${draftId}/promote`, { method: 'POST' })
      const payload = await response.json().catch(() => ({} as {
        published?: {
          imageId?: string
          imageIds?: string[]
          routeLineIds?: string[]
        }
      }))
      if (!response.ok) throw new Error()

      const supabase = createClient()
      const refreshed = await fetchOwnSubmissions(supabase, userId, csrfFetch, 24)
      setSubmissions(refreshed)
      syncOwnLogbookCache((current) => ({
        ...current,
        submissions: refreshed,
      }))

      const imageId = payload.published?.imageId
      const imageCount = Array.isArray(payload.published?.imageIds)
        ? payload.published.imageIds.length
        : (imageId ? 1 : 0)
      const routeCount = Array.isArray(payload.published?.routeLineIds)
        ? payload.published.routeLineIds.length
        : 0
      addToast(`Success! Created ${routeCount} route${routeCount === 1 ? '' : 's'} across ${imageCount} face${imageCount === 1 ? '' : 's'}.`, 'success')
      if (imageId) {
        const query = new URLSearchParams({
          publishedFaces: String(imageCount),
          publishedRoutes: String(routeCount),
        })
        router.push(`/logbook/submissions/${imageId}/edit?${query.toString()}`)
      }
    } catch {
      addToast('Failed to publish draft', 'error')
    } finally {
      setPublishingDraftId(null)
    }
  }

  const statusStyles = {
    flash: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200',
    top: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200',
    try: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-200',
  }

  const ownerSubmissionCounts = useMemo(() => ({
    all: submissions.length,
    drafts: submissions.filter((submission) => submission.status === 'draft').length,
    'pending-review': submissions.filter((submission) => submission.status === 'pending_review').length,
    published: submissions.filter((submission) => submission.status === 'published').length,
  }), [submissions])

  const ownerVisibleSubmissions = useMemo(() => {
    if (ownerSubmissionTab === 'drafts') {
      return submissions.filter((submission) => submission.status === 'draft')
    }

    if (ownerSubmissionTab === 'pending-review') {
      return submissions.filter((submission) => submission.status === 'pending_review')
    }

    if (ownerSubmissionTab === 'published') {
      return submissions.filter((submission) => submission.status === 'published')
    }

    return submissions
  }, [ownerSubmissionTab, submissions])

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950">
      <ToastContainer toasts={toasts} onRemove={removeToast} />

      {isOwnProfile && profile && (
        <Card className="m-0 border-x-0 border-t-0 rounded-none py-0 gap-0">
          <CardContent className="px-4 py-4">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-3">
              {profile.first_name || profile.last_name 
                ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim()
                : profile.display_name || profile.username}
            </h1>
            <div className="flex items-center gap-3">
              {profile.avatar_url ? (
                <Image
                  src={profile.avatar_url}
                  alt={profile.username}
                  width={40}
                  height={40}
                  unoptimized
                  className="w-10 h-10 rounded-full object-cover"
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
                  <span className="text-sm font-medium text-gray-600 dark:text-gray-300">
                    {profile.username?.slice(0, 2).toUpperCase()}
                  </span>
                </div>
              )}
              <div className="leading-tight">
                <p className="text-sm text-gray-500 dark:text-gray-400">@{profile.username}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {!isOwnProfile && profile && (
        <Card className="m-0 border-x-0 border-t-0 rounded-none">
          <CardContent className="flex flex-col sm:flex-row items-center gap-6 py-6 px-4">
            {profile.avatar_url ? (
              <Image
                src={profile.avatar_url}
                alt={profile.username}
                width={80}
                height={80}
                unoptimized
                className="w-20 h-20 rounded-full object-cover"
              />
            ) : (
              <div className="w-20 h-20 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
                <span className="text-2xl font-medium text-gray-600 dark:text-gray-300">
                  {profile.username?.slice(0, 2).toUpperCase()}
                </span>
              </div>
            )}
            <div className="text-center sm:text-left">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-1">
                {profile.first_name || profile.last_name 
                  ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim()
                  : profile.display_name || profile.username}
              </h1>
              <p className="text-gray-500 dark:text-gray-400">@{profile.username}</p>
              {profile.bio && (
                <p className="text-gray-600 dark:text-gray-300 mt-3 max-w-xl">
                  {profile.bio}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {logs.length === 0 ? (
        submissions.length === 0 ? (
          <EmptyLogbook onGoToMap={() => router.push('/')} />
        ) : null
      ) : null}

      {stats ? (
        <div className="space-y-0">
          <Card className="m-0 border-x-0 border-t-0 rounded-none py-0 gap-0">
            <CardHeader className="py-2 px-4">
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="text-base">2-Month Average</CardTitle>
                <p className="text-base font-semibold text-gray-900 dark:text-gray-100 text-right whitespace-nowrap">
                  {formatGradeForDisplay(getGradeFromPoints(stats.twoMonthAverage), gradeSystem)}
                  <span className="text-sm font-normal text-gray-500 dark:text-gray-400 ml-2">
                    ({stats.totalFlashes} flashes, {stats.totalTops} tops)
                  </span>
                </p>
              </div>
            </CardHeader>
          </Card>

          <Card className="m-0 border-x-0 border-t-0 rounded-none">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Grade History (Last 365 Days)</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {stats.gradeHistory.length > 0 ? (
                <GradeHistoryChart data={stats.gradeHistory} />
              ) : (
                <p className="text-gray-500 dark:text-gray-400 py-4">No data for the past year</p>
              )}
            </CardContent>
          </Card>

          <Card className="m-0 border-x-0 border-t-0 rounded-none">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Grade Pyramid (Past Year)</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <GradePyramid pyramid={stats.gradePyramid} lowestGrade={lowestGrade} />
            </CardContent>
          </Card>

          <Card className="m-0 border-x-0 border-t-0 rounded-none">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Top 10 Hardest (Last 60 Days)</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {stats.top10Hardest.length > 0 ? (
                <div className="space-y-0">
                  {stats.top10Hardest.map((log: LogEntry, index: number) => (
                    <div key={log.id} className="flex items-center justify-between py-3 border-b border-gray-100 dark:border-gray-800 last:border-0">
                      <div className="flex items-center gap-3">
                        <span className="text-sm text-gray-500 dark:text-gray-400 w-6">{index + 1}.</span>
                        <Link href={`/climb/${log.climb_id}`} className="flex items-center gap-3 min-w-0 hover:opacity-90 transition-opacity">
                          {log.climbs?.image_url && (
                            <Image
                              src={resolveRouteImageUrl(log.climbs.image_url)}
                              alt={log.climbs.name || 'Climb image'}
                              width={48}
                              height={48}
                              unoptimized
                              className="w-10 h-10 sm:w-12 sm:h-12 object-cover rounded shrink-0"
                            />
                          )}
                          <div className="min-w-0">
                            <p className="font-medium text-gray-900 dark:text-gray-100 hover:underline truncate">{log.climbs?.name}</p>
                            <p className="text-sm text-gray-500 dark:text-gray-400 truncate">{log.climbs?.crags?.name}</p>
                          </div>
                        </Link>
                      </div>
                      <span className={`px-2 py-1 rounded text-sm font-medium ${statusStyles[log.style as keyof typeof statusStyles]}`}>
                        {log.style === 'flash' && '⚡ '}
                        {formatGradeForDisplay(log.climbs?.grade, gradeSystem)}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 dark:text-gray-400 py-4">No climbs logged in the last 60 days</p>
              )}
            </CardContent>
          </Card>

          <Card className="m-0 border-x-0 border-t-0 rounded-none">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Recent Climbs</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-0">
                {recentLogs.map((log) => (
                  <div key={log.id} className="flex items-center gap-2 sm:gap-4 py-3 border-b border-gray-100 dark:border-gray-800 last:border-0">
                    {log.climbs?.image_url && (
                      <Link href={`/climb/${log.climb_id}`} className="shrink-0">
                        <Image
                          src={resolveRouteImageUrl(log.climbs.image_url)}
                          alt={log.climbs.name}
                          width={48}
                          height={48}
                          unoptimized
                          className="w-10 h-10 sm:w-12 sm:h-12 object-cover rounded"
                        />
                      </Link>
                    )}
                    <div className="flex-1">
                      <Link href={`/climb/${log.climb_id}`} className="hover:underline">
                        <p className="font-medium text-gray-900 dark:text-gray-100">{log.climbs?.name}</p>
                      </Link>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {log.climbs?.crags?.name} • {new Date(log.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-sm font-medium ${statusStyles[log.style as keyof typeof statusStyles]}`}>
                      {log.style === 'flash' && '⚡ '}
                      {formatGradeForDisplay(log.climbs?.grade, gradeSystem)}
                    </span>
                    {isOwnProfile && (
                      deletingId === log.id ? (
                        <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                      ) : (
                        <button
                          onClick={() => handleDeleteLog(log.id)}
                          className="text-gray-400 hover:text-red-500 p-1 ml-2 transition-colors"
                          title="Remove from logbook"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      )
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {(isOwnProfile || submissions.length > 0) && (
            <Card className="m-0 border-x-0 border-t-0 rounded-none">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-lg">{isOwnProfile ? 'Your submissions' : 'Contributions'}</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                {isOwnProfile && (
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      {[
                        { id: 'all', label: 'All' },
                        { id: 'drafts', label: 'Drafts' },
                        { id: 'pending-review', label: 'Pending review' },
                        { id: 'published', label: 'Published' },
                      ].map((tab) => {
                        const isActive = ownerSubmissionTab === tab.id
                        const count = ownerSubmissionCounts[tab.id as OwnerSubmissionsTab]
                        return (
                          <button
                            key={tab.id}
                            type="button"
                            onClick={() => setOwnerSubmissionTab(tab.id as OwnerSubmissionsTab)}
                            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                              isActive
                                ? 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900'
                                : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
                            }`}
                          >
                            {tab.label} ({count})
                          </button>
                        )
                      })}
                    </div>
                    <Link
                      href="/submit"
                      className="inline-flex rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
                    >
                      New upload
                    </Link>
                  </div>
                )}
                {isOwnProfile && ownerVisibleSubmissions.length === 0 ? (
                  <p className="py-2 text-sm text-gray-500 dark:text-gray-400">
                    {ownerSubmissionTab === 'drafts'
                      ? 'No drafts yet.'
                      : ownerSubmissionTab === 'pending-review'
                        ? 'No submissions pending review.'
                        : ownerSubmissionTab === 'published'
                          ? 'No published submissions yet.'
                          : 'No submissions yet.'}
                  </p>
                ) : null}
                <SubmissionList
                  submissions={isOwnProfile ? ownerVisibleSubmissions : submissions}
                  isOwnProfile={isOwnProfile}
                  deletingDraftId={deletingDraftId}
                  publishingDraftId={publishingDraftId}
                  onDeleteDraft={handleDeleteDraft}
                  onPublishDraft={handlePublishDraft}
                />
              </CardContent>
            </Card>
          )}
        </div>
      ) : (isOwnProfile || submissions.length > 0) ? (
        <Card className="m-0 border-x-0 border-t-0 rounded-none">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-lg">{isOwnProfile ? 'Your submissions' : 'Contributions'}</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {isOwnProfile && (
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  {[
                    { id: 'all', label: 'All' },
                    { id: 'drafts', label: 'Drafts' },
                    { id: 'pending-review', label: 'Pending review' },
                    { id: 'published', label: 'Published' },
                  ].map((tab) => {
                    const isActive = ownerSubmissionTab === tab.id
                    const count = ownerSubmissionCounts[tab.id as OwnerSubmissionsTab]
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setOwnerSubmissionTab(tab.id as OwnerSubmissionsTab)}
                        className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                          isActive
                            ? 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
                        }`}
                      >
                        {tab.label} ({count})
                      </button>
                    )
                  })}
                </div>
                <Link
                  href="/submit"
                  className="inline-flex rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
                >
                  New upload
                </Link>
              </div>
            )}
            {isOwnProfile && ownerVisibleSubmissions.length === 0 ? (
              <p className="py-2 text-sm text-gray-500 dark:text-gray-400">
                {ownerSubmissionTab === 'drafts'
                  ? 'No drafts yet.'
                  : ownerSubmissionTab === 'pending-review'
                    ? 'No submissions pending review.'
                    : ownerSubmissionTab === 'published'
                      ? 'No published submissions yet.'
                      : 'No submissions yet.'}
              </p>
            ) : null}
            <SubmissionList
              submissions={isOwnProfile ? ownerVisibleSubmissions : submissions}
              isOwnProfile={isOwnProfile}
              deletingDraftId={deletingDraftId}
              publishingDraftId={publishingDraftId}
              onDeleteDraft={handleDeleteDraft}
              onPublishDraft={handlePublishDraft}
            />
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
