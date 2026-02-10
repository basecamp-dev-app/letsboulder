'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { HelpCircle, Loader2, X } from 'lucide-react'
import { csrfFetch } from '@/hooks/useCsrf'
import { SELECTABLE_GRADES, VALID_GRADES } from '@/lib/verification-types'
import type { ClimbStatusResponse, GradeVoteDistribution } from '@/lib/verification-types'
import RoutePreviewThumb from '@/app/image/components/RoutePreviewThumb'
import type { RoutePoint } from '@/lib/useRouteSelection'
import { useGradeSystem } from '@/hooks/useGradeSystem'
import { formatGradeForDisplay } from '@/lib/grade-display'

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

function buildVoteOrderIndex(): Map<string, number> {
  const m = new Map<string, number>()
  VALID_GRADES.forEach((g, idx) => m.set(g, idx))
  return m
}

const VOTE_ORDER_INDEX = buildVoteOrderIndex()

const GRADE_OPTIONS = SELECTABLE_GRADES as readonly string[]

function sortVotesByGradeOrder(votes: GradeVoteDistribution[]): GradeVoteDistribution[] {
  return [...votes].sort((a, b) => (VOTE_ORDER_INDEX.get(a.grade) ?? 1e9) - (VOTE_ORDER_INDEX.get(b.grade) ?? 1e9))
}

function deriveUniqueMode(votes: GradeVoteDistribution[]): { grade: string | null; tied: boolean } {
  if (!votes || votes.length === 0) return { grade: null, tied: false }

  let max = 0
  for (const v of votes) max = Math.max(max, v.vote_count)
  if (max <= 0) return { grade: null, tied: false }

  const top = votes.filter((v) => v.vote_count === max)
  if (top.length === 1) return { grade: top[0]!.grade, tied: false }
  return { grade: top[0]!.grade, tied: true }
}

function formatRelativeDate(iso: string): string {
  const d = new Date(iso)
  const now = Date.now()
  const diff = Math.max(0, now - d.getTime())
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function VoteBars({ votes, userVote, gradeSystem }: { votes: GradeVoteDistribution[]; userVote: string | null; gradeSystem: 'font' | 'v' }) {
  const sortedVotes = useMemo(() => sortVotesByGradeOrder(votes), [votes])
  const totalVotes = useMemo(() => sortedVotes.reduce((sum, v) => sum + v.vote_count, 0), [sortedVotes])
  const maxVotes = useMemo(() => Math.max(1, ...sortedVotes.map((v) => v.vote_count)), [sortedVotes])

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950/40 p-4">
      <div className="flex items-baseline justify-between">
        <p className="text-sm font-medium text-gray-900 dark:text-gray-200">Grade votes</p>
        <p className="text-xs text-gray-600 dark:text-gray-400 tabular-nums">{totalVotes} total</p>
      </div>

      {sortedVotes.length === 0 ? (
        <div className="mt-4">
          <div className="h-2 rounded-full bg-gray-200 dark:bg-gray-800" />
          <p className="text-xs text-gray-600 dark:text-gray-400 mt-3">No votes yet</p>
        </div>
      ) : (
        <div className="mt-4 space-y-2">
          {sortedVotes.map((v) => {
            const pct = Math.round((v.vote_count / maxVotes) * 100)
            const isUser = !!userVote && userVote === v.grade
            return (
              <div
                key={v.grade}
                className={`grid grid-cols-[52px_1fr_auto] items-center gap-3 rounded-lg px-2 py-1 ${
                  isUser ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                }`}
              >
                <span className={`text-xs font-medium tabular-nums ${isUser ? 'text-blue-700 dark:text-blue-200' : 'text-gray-900 dark:text-gray-200'}`}>
                  {formatGradeForDisplay(v.grade, gradeSystem)}
                </span>
                <div className="h-2 rounded-full bg-gray-200 dark:bg-gray-800 overflow-hidden relative">
                  <div
                    className={`h-full rounded-full ${isUser ? 'bg-blue-600' : 'bg-blue-500/80'}`}
                    style={{ width: `${pct}%` }}
                  />
                  {pct > 0 && (
                    <div
                      className={`absolute top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full ${isUser ? 'bg-blue-700' : 'bg-blue-600/80'}`}
                      style={{ left: `calc(${pct}% - 3px)` }}
                    />
                  )}
                </div>
                <span
                  className={`text-xs tabular-nums rounded-md px-2 py-0.5 border ${
                    isUser
                      ? 'border-blue-200 text-blue-800 bg-blue-50 dark:border-blue-800 dark:text-blue-200 dark:bg-blue-900/20'
                      : 'border-gray-200 text-gray-700 bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:bg-gray-800/40'
                  }`}
                >
                  {v.vote_count}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

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
  const gradeSystem = useGradeSystem()
  const climbId = route.climb?.id || ''
  const routeName = (route.climb?.name || '').trim() || 'Unnamed'
  const routeGrade = (route.climb?.grade || '').trim() || '—'
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
      const response = await csrfFetch(`/api/climbs/${climbId}/grade-vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ grade: selectedGrade }),
      })
      if (!response.ok) throw new Error()

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
              <div>
                {topsLoading ? (
                  <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950/40 p-6 flex items-center justify-center">
                    <Loader2 className="w-5 h-5 animate-spin text-gray-500 dark:text-gray-400" />
                  </div>
                ) : tops && tops.length > 0 ? (
                  <div className="space-y-2">
                    {tops.map((t) => (
                      <Link
                        key={`${t.user_id}-${t.created_at}`}
                        href={`/logbook/${t.user_id}`}
                        className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950/40 px-3 py-2 hover:border-gray-300 dark:hover:border-gray-700"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          {t.profile.avatar_url ? (
                            <img
                              src={t.profile.avatar_url}
                              alt={t.profile.display_name}
                              className="w-9 h-9 rounded-full object-cover"
                            />
                          ) : (
                            <div className="w-9 h-9 rounded-full bg-gray-200 dark:bg-gray-800 flex items-center justify-center text-xs text-gray-700 dark:text-gray-200">
                              {t.profile.display_name.slice(0, 2).toUpperCase()}
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="text-sm text-gray-900 dark:text-gray-100 truncate">{t.profile.display_name}</p>
                            <p className="text-xs text-gray-600 dark:text-gray-500">
                              {t.style === 'flash' ? 'Flash' : 'Top'} • {formatRelativeDate(t.created_at)}
                            </p>
                          </div>
                        </div>
                        <span className={`text-xs px-2 py-1 rounded border ${
                          t.style === 'flash'
                            ? 'bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-200 dark:border-green-800'
                            : 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-200 dark:border-blue-800'
                        }`}>
                          {t.style === 'flash' ? '⚡' : '✓'}
                        </span>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950/40 p-6">
                    <p className="text-sm text-gray-900 dark:text-gray-200">Be the first to log this recently!</p>
                    <p className="text-xs text-gray-600 dark:text-gray-500 mt-1">Only public profiles appear here.</p>
                  </div>
                )}
              </div>
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
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleLogClick('flash')}
                  disabled={logging}
                  className={`flex-1 py-2 rounded-lg font-medium transition-colors border ${
                    userLogStyle === 'flash'
                      ? 'bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-200 dark:border-green-800'
                      : 'bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-900 hover:border-gray-300 dark:hover:border-gray-700'
                  } disabled:opacity-60`}
                >
                  Flash
                </button>
                <button
                  onClick={() => handleLogClick('top')}
                  disabled={logging}
                  className={`flex-1 py-2 rounded-lg font-medium transition-colors border ${
                    userLogStyle === 'top'
                      ? 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-200 dark:border-blue-800'
                      : 'bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-900 hover:border-gray-300 dark:hover:border-gray-700'
                  } disabled:opacity-60`}
                >
                  Top
                </button>
                <button
                  onClick={() => handleLogClick('try')}
                  disabled={logging}
                  className={`flex-1 py-2 rounded-lg font-medium transition-colors border ${
                    userLogStyle === 'try'
                      ? 'bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-200 dark:border-yellow-800'
                      : 'bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-900 hover:border-gray-300 dark:hover:border-gray-700'
                  } disabled:opacity-60`}
                >
                  Try
                </button>
                <button
                  onClick={() => setInfoOpen(true)}
                  className="shrink-0 p-2 rounded-lg border border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700 bg-white dark:bg-gray-950 hover:bg-gray-50 dark:hover:bg-gray-900"
                  aria-label="Log types info"
                >
                  <HelpCircle className="w-4 h-4 text-gray-700 dark:text-gray-200" />
                </button>
              </div>
        </div>
      </div>

      {infoOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center px-4" onClick={() => setInfoOpen(false)}>
          <div
            className="w-full max-w-sm rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <p className="text-base font-semibold text-gray-900 dark:text-white">Log types</p>
              <button
                onClick={() => setInfoOpen(false)}
                className="p-2 -m-2 rounded hover:bg-gray-100 text-gray-600 hover:text-gray-900 dark:hover:bg-gray-900 dark:text-gray-300 dark:hover:text-white"
                aria-label="Close info"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="mt-3 space-y-3 text-sm text-gray-700 dark:text-gray-300">
              <div>
                <p className="font-medium text-gray-900 dark:text-white">Flash</p>
                <p className="text-gray-600 dark:text-gray-400">Sent first try.</p>
              </div>
              <div>
                <p className="font-medium text-gray-900 dark:text-white">Top</p>
                <p className="text-gray-600 dark:text-gray-400">Sent (not first try).</p>
              </div>
              <div>
                <p className="font-medium text-gray-900 dark:text-white">Try</p>
                <p className="text-gray-600 dark:text-gray-400">Attempted but not sent.</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
