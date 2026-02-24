'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import dynamic from 'next/dynamic'
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
import {
  formatSubmissionCreditHandle,
  normalizeSubmissionCreditHandle,
  normalizeSubmissionCreditPlatform,
  type SubmissionCreditPlatform,
} from '@/lib/submission-credit'

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

interface Submission {
  id: string
  url: string
  created_at: string
  crag_name: string | null
  route_lines_count: number
  contribution_credit_platform: string | null
  contribution_credit_handle: string | null
}

const CREDIT_PLATFORM_OPTIONS: Array<{ value: SubmissionCreditPlatform; label: string }> = [
  { value: 'instagram', label: 'Instagram' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'youtube', label: 'YouTube' },
  { value: 'x', label: 'X' },
  { value: 'other', label: 'Other' },
]

interface LogbookViewProps {
  userId: string
  isOwnProfile: boolean
  initialLogs?: Climb[]
  profile?: Profile
  initialSubmissions?: Submission[]
}

export default function LogbookView({ isOwnProfile, initialLogs = [], profile, initialSubmissions = [] }: LogbookViewProps) {
  const gradeSystem = useGradeSystem()
  const router = useRouter()
  const [logs, setLogs] = useState<Climb[]>(initialLogs)
  const [submissions, setSubmissions] = useState<Submission[]>(initialSubmissions)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [editingCreditForId, setEditingCreditForId] = useState<string | null>(null)
  const [creditPlatform, setCreditPlatform] = useState<SubmissionCreditPlatform>('instagram')
  const [creditHandle, setCreditHandle] = useState('')
  const [savingCreditForId, setSavingCreditForId] = useState<string | null>(null)
  const { toasts, addToast, removeToast } = useToast()

  const stats = useMemo(() => {
    if (logs.length === 0) return null
    return calculateStats(logs)
  }, [logs])
  const lowestGrade = stats ? getLowestGrade(stats.gradePyramid) : '6A'

  const recentLogs = useMemo(() => logs.slice(0, 20), [logs])

  const beginEditingCredit = (submission: Submission) => {
    const normalizedPlatform = normalizeSubmissionCreditPlatform(submission.contribution_credit_platform)
    setEditingCreditForId(submission.id)
    setCreditPlatform(normalizedPlatform || 'instagram')
    setCreditHandle(submission.contribution_credit_handle || '')
  }

  const cancelEditingCredit = () => {
    setEditingCreditForId(null)
    setCreditPlatform('instagram')
    setCreditHandle('')
  }

  const saveSubmissionCredit = async (submissionId: string) => {
    if (savingCreditForId) return

    const normalizedHandle = normalizeSubmissionCreditHandle(creditHandle)
    if (creditHandle.trim().length > 0 && !normalizedHandle) {
      addToast('Invalid handle. Use letters, numbers, dots, underscores, or hyphens.', 'error')
      return
    }

    setSavingCreditForId(submissionId)
    try {
      const response = await csrfFetch(`/api/submissions/${submissionId}/credit`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform: normalizedHandle ? creditPlatform : null,
          handle: normalizedHandle,
        }),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to save contribution credit')
      }

      const updatedPlatform = typeof payload?.credit?.platform === 'string' ? payload.credit.platform : null
      const updatedHandle = typeof payload?.credit?.handle === 'string' ? payload.credit.handle : null

      setSubmissions((previous) => previous.map((submission) => {
        if (submission.id !== submissionId) return submission
        return {
          ...submission,
          contribution_credit_platform: updatedPlatform,
          contribution_credit_handle: updatedHandle,
        }
      }))

      addToast(updatedHandle ? 'Contribution credit saved' : 'Contribution credit removed', 'success')
      cancelEditingCredit()
    } catch (error) {
      addToast(error instanceof Error ? error.message : 'Failed to save contribution credit', 'error')
    } finally {
      setSavingCreditForId(null)
    }
  }

  const handleDeleteLog = async (logId: string) => {
    setDeletingId(logId)
    try {
      const response = await csrfFetch(`/api/logs/${logId}`, { method: 'DELETE' })
      if (!response.ok) throw new Error()

      const updatedLogs = logs.filter(log => log.id !== logId)
      setLogs(updatedLogs)
      addToast('Climb removed from logbook', 'success')
    } catch {
      addToast('Failed to remove climb', 'error')
    } finally {
      setDeletingId(null)
    }
  }

  const statusStyles = {
    flash: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200',
    top: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200',
    try: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-200',
  }

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
                <img
                  src={profile.avatar_url}
                  alt={profile.username}
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
              <img
                src={profile.avatar_url}
                alt={profile.username}
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
                            <img
                              src={resolveRouteImageUrl(log.climbs.image_url)}
                              alt={log.climbs.name || 'Climb image'}
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
                        <img
                          src={resolveRouteImageUrl(log.climbs.image_url)}
                          alt={log.climbs.name}
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

          {submissions.length > 0 && (
            <Card className="m-0 border-x-0 border-t-0 rounded-none">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Contributions</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="space-y-0">
                  {submissions.map((submission) => {
                    const formattedHandle = formatSubmissionCreditHandle(submission.contribution_credit_handle)
                    const isEditingCredit = editingCreditForId === submission.id

                    return (
                      <div
                        key={submission.id}
                        className="py-3 border-b border-gray-100 dark:border-gray-800 last:border-0"
                      >
                        <div className="flex items-center gap-3">
                          <Link
                            href={`/image/${submission.id}`}
                            className="flex min-w-0 flex-1 items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-900/40 rounded-sm"
                          >
                            <img
                              src={resolveRouteImageUrl(submission.url)}
                              alt="Submitted route image"
                              className="w-12 h-12 object-cover rounded"
                            />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                                {submission.crag_name || 'Unknown crag'}
                              </p>
                              <p className="text-xs text-gray-500 dark:text-gray-400">
                                {submission.route_lines_count} route{submission.route_lines_count === 1 ? '' : 's'} • {new Date(submission.created_at).toLocaleDateString()}
                                {formattedHandle ? ` • ${formattedHandle}` : ''}
                              </p>
                            </div>
                          </Link>
                          {isOwnProfile && (
                            <div className="shrink-0 flex flex-col items-end gap-1">
                              <Link
                                href={`/logbook/submissions/${submission.id}/edit`}
                                className="text-xs font-medium text-blue-700 hover:text-blue-800 dark:text-blue-300 dark:hover:text-blue-200"
                              >
                                Edit routes
                              </Link>
                              <button
                                type="button"
                                onClick={() => beginEditingCredit(submission)}
                                className="text-xs font-medium text-gray-700 hover:text-gray-900 dark:text-gray-300 dark:hover:text-gray-100"
                              >
                                {formattedHandle ? 'Edit credit' : 'Add credit'}
                              </button>
                            </div>
                          )}
                        </div>

                        {isOwnProfile && isEditingCredit && (
                          <div className="mt-3 flex flex-col gap-2 rounded-md border border-gray-200 dark:border-gray-700 p-3">
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                              <select
                                value={creditPlatform}
                                onChange={(event) => setCreditPlatform(event.target.value as SubmissionCreditPlatform)}
                                className="sm:col-span-1 w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                              >
                                {CREDIT_PLATFORM_OPTIONS.map((option) => (
                                  <option key={option.value} value={option.value}>{option.label}</option>
                                ))}
                              </select>
                              <input
                                type="text"
                                value={creditHandle}
                                onChange={(event) => setCreditHandle(event.target.value)}
                                placeholder="handle"
                                className="sm:col-span-2 w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                              />
                            </div>
                            <p className="text-xs text-gray-500 dark:text-gray-400">Shown publicly as @{normalizeSubmissionCreditHandle(creditHandle) || 'handle'}</p>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => saveSubmissionCredit(submission.id)}
                                disabled={savingCreditForId === submission.id}
                                className="px-3 py-1.5 text-xs font-medium rounded-md bg-gray-900 text-white hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200 disabled:opacity-60"
                              >
                                {savingCreditForId === submission.id ? 'Saving...' : 'Save credit'}
                              </button>
                              <button
                                type="button"
                                onClick={cancelEditingCredit}
                                disabled={savingCreditForId === submission.id}
                                className="px-3 py-1.5 text-xs font-medium rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      ) : submissions.length > 0 ? (
        <Card className="m-0 border-x-0 border-t-0 rounded-none">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Contributions</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-0">
              {submissions.map((submission) => {
                const formattedHandle = formatSubmissionCreditHandle(submission.contribution_credit_handle)
                const isEditingCredit = editingCreditForId === submission.id

                return (
                  <div
                    key={submission.id}
                    className="py-3 border-b border-gray-100 dark:border-gray-800 last:border-0"
                  >
                    <div className="flex items-center gap-3">
                      <Link
                        href={`/image/${submission.id}`}
                        className="flex min-w-0 flex-1 items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-900/40 rounded-sm"
                      >
                        <img
                          src={resolveRouteImageUrl(submission.url)}
                          alt="Submitted route image"
                          className="w-12 h-12 object-cover rounded"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                            {submission.crag_name || 'Unknown crag'}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {submission.route_lines_count} route{submission.route_lines_count === 1 ? '' : 's'} • {new Date(submission.created_at).toLocaleDateString()}
                            {formattedHandle ? ` • ${formattedHandle}` : ''}
                          </p>
                        </div>
                      </Link>
                      {isOwnProfile && (
                        <div className="shrink-0 flex flex-col items-end gap-1">
                          <Link
                            href={`/logbook/submissions/${submission.id}/edit`}
                            className="text-xs font-medium text-blue-700 hover:text-blue-800 dark:text-blue-300 dark:hover:text-blue-200"
                          >
                            Edit routes
                          </Link>
                          <button
                            type="button"
                            onClick={() => beginEditingCredit(submission)}
                            className="text-xs font-medium text-gray-700 hover:text-gray-900 dark:text-gray-300 dark:hover:text-gray-100"
                          >
                            {formattedHandle ? 'Edit credit' : 'Add credit'}
                          </button>
                        </div>
                      )}
                    </div>

                    {isOwnProfile && isEditingCredit && (
                      <div className="mt-3 flex flex-col gap-2 rounded-md border border-gray-200 dark:border-gray-700 p-3">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          <select
                            value={creditPlatform}
                            onChange={(event) => setCreditPlatform(event.target.value as SubmissionCreditPlatform)}
                            className="sm:col-span-1 w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                          >
                            {CREDIT_PLATFORM_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                          </select>
                          <input
                            type="text"
                            value={creditHandle}
                            onChange={(event) => setCreditHandle(event.target.value)}
                            placeholder="handle"
                            className="sm:col-span-2 w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                          />
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400">Shown publicly as @{normalizeSubmissionCreditHandle(creditHandle) || 'handle'}</p>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => saveSubmissionCredit(submission.id)}
                            disabled={savingCreditForId === submission.id}
                            className="px-3 py-1.5 text-xs font-medium rounded-md bg-gray-900 text-white hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200 disabled:opacity-60"
                          >
                            {savingCreditForId === submission.id ? 'Saving...' : 'Save credit'}
                          </button>
                          <button
                            type="button"
                            onClick={cancelEditingCredit}
                            disabled={savingCreditForId === submission.id}
                            className="px-3 py-1.5 text-xs font-medium rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
