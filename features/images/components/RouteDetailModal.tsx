'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Loader2, X } from 'lucide-react'
import { submitGradeVoteAction } from '@/components/grade-voting-actions'
import LogButtons from '@/features/images/components/LogButtons'
import LogInfoDialog from '@/features/images/components/LogInfoDialog'
import RoutePreviewThumb from '@/features/images/components/RoutePreviewThumb'
import TopsList from '@/features/images/components/TopsList'
import VoteBars from '@/features/images/components/VoteBars'
import { deriveUniqueMode } from '@/features/images/lib/route-detail-utils'
import { formatGradeForDisplay } from '@/lib/grade-display'
import { SELECTABLE_GRADES } from '@/lib/grade-constants'
import { getGradeSystemForClimbType, useGradePreferences } from '@/lib/grades/preferences'
import type { ClimbStatusResponse } from '@/lib/verification-types'
import type { RoutePoint } from '@/types/domain'

type LogStyle = 'flash' | 'top' | 'try'

interface ImageRoute {
  id: string
  color: string
  climb: {
    id: string
    name: string | null
    grade: string | null
    description: string | null
    route_type: string | null
  } | null
}

interface RecentTopItem {
  user_id: string
  style: 'top' | 'flash'
  created_at: string
  profile: {
    id: string
    username: string | null
    display_name: string
    avatar_url: string | null
  }
}

interface RouteDetailModalProps {
  route: ImageRoute
  tab: 'climb' | 'tops'
  onTabChange: (tab: 'climb' | 'tops') => void
  onClose: () => void
  imageUrl: string
  naturalWidth: number
  naturalHeight: number
  routePoints: RoutePoint[]
  routeColor?: string
  climbStatus: ClimbStatusResponse | null
  statusLoading: boolean
  onRefreshStatus: () => Promise<void>
  user: { id: string } | null
  userLogStyle: string | undefined
  logging: boolean
  onLog: (style: LogStyle) => Promise<boolean>
  redirectTo: string
}

const GRADE_OPTIONS = SELECTABLE_GRADES as readonly string[]

export default function RouteDetailModal({
  route,
  tab,
  onTabChange,
  onClose,
  imageUrl,
  naturalWidth,
  naturalHeight,
  routePoints,
  routeColor,
  climbStatus,
  statusLoading,
  onRefreshStatus,
  user,
  userLogStyle,
  logging,
  onLog,
  redirectTo,
}: RouteDetailModalProps) {
  const gradePreferences = useGradePreferences()
  const climbId = route.climb?.id || ''
  const climbHref = climbId ? `${redirectTo}${redirectTo.includes('?') ? '&' : '?'}climb=${climbId}&route=${route.id}` : redirectTo
  const routeName = (route.climb?.name || '').trim() || 'Unnamed'
  const routeGrade = (route.climb?.grade || '').trim() || '—'
  const gradeSystem = getGradeSystemForClimbType(route.climb?.route_type || undefined, gradePreferences)
  const baseFallbackGrade = routeGrade !== '—' ? routeGrade : '6A'
  const [infoOpen, setInfoOpen] = useState(false)

  const [sliderIndex, setSliderIndex] = useState(0)
  const [sliderSubmitting, setSliderSubmitting] = useState(false)
  const [lastSubmittedGrade, setLastSubmittedGrade] = useState<string | null>(null)
  const [displayedGrade, setDisplayedGrade] = useState<string>(baseFallbackGrade)
  const hasInteractedRef = useRef(false)

  const [topsLoading, setTopsLoading] = useState(false)
  const [tops, setTops] = useState<RecentTopItem[] | null>(null)
  const topsCacheRef = useRef(new Map<string, RecentTopItem[]>())

  const votes = climbStatus?.grade_votes || []
  const userVote = climbStatus?.user_grade_vote || null

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  useEffect(() => {
    setInfoOpen(false)
    setTops(null)
  }, [climbId])

  useEffect(() => {
    const fallback = baseFallbackGrade
    if (!climbStatus) {
      setDisplayedGrade((prev) => prev || fallback)
      return
    }

    const { grade, tied } = deriveUniqueMode(climbStatus.grade_votes)
    if (!grade) {
      setDisplayedGrade((prev) => prev || fallback)
      return
    }

    if (tied) {
      setDisplayedGrade((prev) => prev || fallback)
      return
    }

    setDisplayedGrade(grade)
  }, [climbStatus, baseFallbackGrade])

  useEffect(() => {
    const initial = userVote || displayedGrade || baseFallbackGrade
    const idx = GRADE_OPTIONS.indexOf(initial)
    setSliderIndex(idx >= 0 ? idx : 0)
    setLastSubmittedGrade(userVote)
  }, [userVote, displayedGrade, baseFallbackGrade])

  useEffect(() => {
    if (tab !== 'tops') return
    if (!climbId) return

    const cached = topsCacheRef.current.get(climbId)
    if (cached) {
      setTops(cached)
      return
    }

    let cancelled = false
    setTopsLoading(true)
    fetch(`/api/climbs/${climbId}/recent-tops`)
      .then(async (r) => {
        if (!r.ok) throw new Error('Failed')
        return r.json()
      })
      .then((data) => {
        if (cancelled) return
        const items = (data?.recent_tops || []) as RecentTopItem[]
        topsCacheRef.current.set(climbId, items)
        setTops(items)
      })
      .catch(() => {
        if (cancelled) return
        setTops([])
      })
      .finally(() => {
        if (cancelled) return
        setTopsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [tab, climbId])

  const selectedGrade = GRADE_OPTIONS[sliderIndex] || '6A'

  const submitVote = async () => {
    if (!user) return
    if (!climbId) return
    if (!hasInteractedRef.current) return
    if (sliderSubmitting) return
    if (lastSubmittedGrade === selectedGrade) {
      hasInteractedRef.current = false
      return
    }

    setSliderSubmitting(true)
    try {
      const result = await submitGradeVoteAction(climbId, selectedGrade)
      if (!result.success) throw new Error(result.error)

      setDisplayedGrade(selectedGrade)
      setLastSubmittedGrade(selectedGrade)
      hasInteractedRef.current = false
      await onRefreshStatus()
    } catch {
      // Keep slider open; user can retry by releasing again.
    } finally {
      setSliderSubmitting(false)
    }
  }

  const handleLogClick = async (style: LogStyle) => {
    const ok = await onLog(style)
    if (!ok) return
  }

  const totalVotes = votes.reduce((sum, v) => sum + v.vote_count, 0)
  const canVote = userLogStyle === 'flash' || userLogStyle === 'top'

  return (
    <div className="fixed inset-0 z-[6000] bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 flex flex-col">
      <div className="px-5 pt-5 pb-3 border-b border-gray-200 dark:border-gray-800">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-4 min-w-0">
            <RoutePreviewThumb
              imageUrl={imageUrl}
              naturalWidth={naturalWidth}
              naturalHeight={naturalHeight}
              points={routePoints}
              stroke={routeColor || '#22c55e'}
              onClick={onClose}
              className="relative w-20 h-20 sm:w-24 sm:h-24 md:w-28 md:h-28 rounded-xl overflow-hidden border border-gray-200 dark:border-gray-800 bg-gray-100 dark:bg-gray-900 shrink-0"
            />

            <div className="min-w-0">
            <button
              onClick={onClose}
              className="text-sm text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white"
            >
              Back to routes
            </button>
            <p className="text-lg font-semibold text-gray-900 dark:text-white leading-tight mt-2">{routeName}</p>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-sm text-gray-700 dark:text-gray-300">{formatGradeForDisplay(displayedGrade, gradeSystem)}</span>
              {route.climb?.route_type && (
                <>
                  <span className="text-xs text-gray-400">•</span>
                  <span className="text-xs text-gray-500 dark:text-gray-400 capitalize">
                    {route.climb.route_type.replace('-', ' ')}
                  </span>
                </>
              )}
              <span className="text-xs text-gray-400">•</span>
              <span className="text-xs text-gray-500 dark:text-gray-400 tabular-nums">{totalVotes} votes</span>
            </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-md hover:bg-gray-100 text-gray-600 hover:text-gray-900 dark:hover:bg-gray-900 dark:text-gray-300 dark:hover:text-white"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="mt-4 flex gap-2">
          <button
            onClick={() => onTabChange('climb')}
            className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
              tab === 'climb'
                ? 'bg-gray-900 text-white border-gray-900 dark:bg-gray-100 dark:text-gray-900 dark:border-gray-100'
                : 'bg-white dark:bg-gray-950 text-gray-700 dark:text-gray-200 border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-900 hover:border-gray-300 dark:hover:border-gray-700'
            }`}
          >
            Climb
          </button>
          <button
            onClick={() => onTabChange('tops')}
            className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
              tab === 'tops'
                ? 'bg-gray-900 text-white border-gray-900 dark:bg-gray-100 dark:text-gray-900 dark:border-gray-100'
                : 'bg-white dark:bg-gray-950 text-gray-700 dark:text-gray-200 border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-900 hover:border-gray-300 dark:hover:border-gray-700'
            }`}
          >
            Tops
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4">
            {tab === 'climb' ? (
              <div className="space-y-4">
                {climbId && (
                  <Link
                    href={climbHref}
                    className="block rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-medium text-blue-900 transition-colors hover:bg-blue-100 dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-blue-200 dark:hover:bg-blue-900/40"
                  >
                    Open climb page
                  </Link>
                )}

                {statusLoading ? (
                  <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950/40 p-6 flex items-center justify-center">
                    <Loader2 className="w-5 h-5 animate-spin text-gray-500 dark:text-gray-400" />
                  </div>
                ) : (
                  <VoteBars votes={votes} userVote={userVote} gradeSystem={gradeSystem} />
                )}

                {route.climb?.description && (
                  <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950/40 p-4">
                    <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{route.climb.description}</p>
                  </div>
                )}
              </div>
            ) : (
              <TopsList tops={tops} loading={topsLoading} />
            )}
      </div>

      <div className="border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950">
        {tab === 'climb' && canVote && (
          <div className="px-5 pt-4 pb-3 border-b border-gray-200 dark:border-gray-800">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-gray-200">Vote grade</p>
                <p className="text-xs text-gray-500 dark:text-gray-500">Release to submit</p>
              </div>
              <div className="text-sm font-semibold text-gray-900 dark:text-white tabular-nums">{formatGradeForDisplay(selectedGrade, gradeSystem)}</div>
            </div>

            <input
              type="range"
              min={0}
              max={GRADE_OPTIONS.length - 1}
              step={1}
              value={sliderIndex}
              onChange={(e) => {
                hasInteractedRef.current = true
                setSliderIndex(parseInt(e.target.value))
              }}
              onPointerUp={submitVote}
              onMouseUp={submitVote}
              onTouchEnd={submitVote}
              onKeyUp={submitVote}
              disabled={!user || sliderSubmitting}
              className="w-full mt-3"
            />

            <div className="flex items-center justify-between mt-3">
              {!user ? (
                <div className="text-xs text-gray-600 dark:text-gray-400">
                  <Link
                    href={`/auth?redirect_to=${encodeURIComponent(redirectTo)}`}
                    className="text-blue-600 hover:text-blue-700 dark:text-blue-300 dark:hover:text-blue-200 underline underline-offset-4"
                  >
                    Sign in
                  </Link>
                  <span className="text-gray-500 dark:text-gray-500"> to vote on the grade</span>
                </div>
              ) : (
                <div className="text-xs text-gray-600 dark:text-gray-400">
                  {userVote ? `Your vote: ${formatGradeForDisplay(userVote, gradeSystem)}` : 'No grade vote yet'}
                </div>
              )}

              {sliderSubmitting && (
                <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Saving
                </div>
              )}
            </div>
          </div>
        )}

        <div className="px-5 py-4 sticky bottom-0">
          <LogButtons
            logging={logging}
            userLogStyle={userLogStyle}
            onLog={handleLogClick}
            onInfoOpen={() => setInfoOpen(true)}
          />
        </div>
      </div>

      <LogInfoDialog open={infoOpen} onClose={() => setInfoOpen(false)} />
    </div>
  )
}
