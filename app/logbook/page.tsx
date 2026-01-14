'use client'

import { useEffect, useState, Suspense } from 'react'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import GradeHistoryChart from '@/components/GradeHistoryChart'
import GradePyramid from '@/components/GradePyramid'
import { getGradePoints, calculateStats, getLowestGrade, getGradeFromPoints } from '@/lib/grades'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { EmptyLogbook, LogbookSkeleton } from '@/components/logbook/logbook-states'
import { useToast } from '@/components/logbook/toast'
import { Trash2, Loader2 } from 'lucide-react'

interface LoggedClimb {
  id: string
  climb_id: string
  style: string
  created_at: string
  points?: number
  climbs: {
    name: string
    grade: string
    image_url?: string
    crags: {
      name: string
    }
  }
}

interface Stats {
  top10Hardest: LoggedClimb[]
  twoMonthAverage: number
  gradeHistory: Array<{ month: string; top: number; flash: number }>
  gradePyramid: Record<string, number>
  averageGrade: string
  totalClimbs: number
  totalFlashes: number
  totalTops: number
  totalTries: number
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
  const [user, setUser] = useState<any>(null)
  const [logs, setLogs] = useState<LoggedClimb[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const searchParams = useSearchParams()
  const { toasts, addToast, removeToast } = useToast()

  const handleDeleteLog = async (logId: string) => {
    setDeletingId(logId)
    try {
      const response = await fetch(`/api/logs/${logId}`, { method: 'DELETE' })
      if (!response.ok) throw new Error('Failed to delete')

      const updatedLogs = logs.filter(log => log.id !== logId)
      setLogs(updatedLogs)
      setStats(calculateStats(updatedLogs))
      addToast('Climb removed from logbook', 'success')
    } catch (error) {
      addToast('Failed to remove climb', 'error')
    } finally {
      setDeletingId(null)
    }
  }

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
              routeLinesData.forEach((rl: any) => {
                if (rl.climb_id && rl.images?.crags?.name) {
                  cragsByClimbId[rl.climb_id] = rl.images.crags.name
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
              ? getGradePoints(log.climbs?.grade || '6A') + 10
              : getGradePoints(log.climbs?.grade || '6A')
          })) || []

          setLogs(logsWithPoints)
          setStats(calculateStats(logsWithPoints))
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

  const lowestGrade = stats ? getLowestGrade(stats.gradePyramid) : '6A'

  const statusStyles = {
    flash: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200',
    top: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200',
    try: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-200',
  }

  return (
    <div className="container mx-auto px-4 py-8">
      {toasts.length > 0 && (
        <div className="fixed bottom-4 right-4 z-50 space-y-2">
          {toasts.map((toast) => (
            <div
              key={toast.id}
              className={`flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg text-sm font-medium animate-in slide-in-from-bottom-2 ${
                toast.type === 'success'
                  ? 'bg-green-50 text-green-900 dark:bg-green-900/20 dark:text-green-100'
                  : toast.type === 'error'
                  ? 'bg-red-50 text-red-900 dark:bg-red-900/20 dark:text-red-100'
                  : 'bg-gray-50 text-gray-900 dark:bg-gray-800 dark:text-gray-100'
              }`}
            >
              <span>{toast.message}</span>
              <button
                onClick={() => removeToast(toast.id)}
                className="p-1 hover:bg-black/5 dark:hover:bg-white/10 rounded ml-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6">Logbook</h1>

      {stats && stats.totalClimbs === 0 ? (
        <EmptyLogbook onGoToMap={() => window.location.href = '/map'} />
      ) : stats ? (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Top 10 Hardest (Last 60 Days)</CardTitle>
            </CardHeader>
            <CardContent>
              {stats.top10Hardest.length > 0 ? (
                <div className="space-y-2">
                  {stats.top10Hardest.map((log, index) => (
                    <div key={log.id} className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-800 last:border-0">
                      <div className="flex items-center gap-3">
                        <span className="text-sm text-gray-500 dark:text-gray-400 w-6">{index + 1}.</span>
                        <div>
                          <p className="font-medium text-gray-900 dark:text-gray-100">{log.climbs?.name}</p>
                          <p className="text-sm text-gray-500 dark:text-gray-400">{log.climbs?.crags?.name}</p>
                        </div>
                      </div>
                        <span className={`px-2 py-1 rounded text-sm font-medium ${statusStyles[log.style as keyof typeof statusStyles]}`}>
                          {log.style === 'flash' && '⚡ '}
                        {log.climbs?.grade}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 dark:text-gray-400">No climbs logged in the last 60 days</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>2-Month Average</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-gray-900 dark:text-gray-100">
                {getGradeFromPoints(stats.twoMonthAverage)}
                <span className="text-lg font-normal text-gray-500 dark:text-gray-400 ml-2">
                  ({stats.totalFlashes} flashes, {stats.totalTops} tops)
                </span>
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Grade History (Last 365 Days)</CardTitle>
            </CardHeader>
            <CardContent>
              {stats.gradeHistory.length > 0 ? (
                <GradeHistoryChart data={stats.gradeHistory} />
              ) : (
                <p className="text-gray-500 dark:text-gray-400">No data for the past year</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Grade Pyramid (Past Year)</CardTitle>
            </CardHeader>
            <CardContent>
              <GradePyramid pyramid={stats.gradePyramid} lowestGrade={lowestGrade} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent Climbs</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {logs.slice(0, 20).map((log) => (
                  <div key={log.id} className="flex items-center gap-4 py-3 border-b border-gray-100 dark:border-gray-800 last:border-0">
                    {log.climbs?.image_url && (
                      <img
                        src={log.climbs.image_url}
                        alt={log.climbs.name}
                        className="w-12 h-12 object-cover rounded"
                      />
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
                      {log.climbs?.grade}
                    </span>
                    {deletingId === log.id ? (
                      <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                    ) : (
                      <button
                        onClick={() => handleDeleteLog(log.id)}
                        className="text-gray-400 hover:text-red-500 p-1 ml-2 transition-colors"
                        title="Remove from logbook"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  )
}
