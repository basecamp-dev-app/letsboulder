'use client'

import { useEffect, useState, Suspense, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import GradeHistoryChart from '@/components/GradeHistoryChart'
import GradePyramid from '@/components/GradePyramid'
import ProfileAvatar, { ProfileAvatarRef } from '@/components/ProfileAvatar'
import { getGradePoints, calculateStats, getLowestGrade, getGradeFromPoints, getNextGrade, getPreviousGrade } from '@/lib/grades'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { EmptyLogbook, LogbookSkeleton } from '@/components/logbook/logbook-states'
import { useToast } from '@/components/logbook/toast'
import { Trash2, ChevronRight, Loader2 } from 'lucide-react'

interface LoggedClimb {
  id: string
  climb_id: string
  status: string
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

interface ProfileData {
  id: string
  username: string
  avatar_url?: string
  email: string
  first_name?: string
  last_name?: string
  gender?: string
}

function getInitials(username: string): string {
  return username
    .split(' ')
    .map(word => word[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
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
  const [profile, setProfile] = useState<ProfileData | null>(null)
  const [logs, setLogs] = useState<LoggedClimb[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const searchParams = useSearchParams()
  const { toasts, addToast, removeToast } = useToast()
  const profileAvatarRef = useRef<ProfileAvatarRef>(null)

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
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      setUser(user)

      if (user) {
        const { data: profileData } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single()

        if (profileData) {
          setProfile({ ...profileData, email: user.email || '' })
        } else {
          const { data: newProfile } = await supabase
            .from('profiles')
            .insert({
              id: user.id,
              email: user.email,
              username: user.email?.split('@')[0] || 'user',
            })
            .select()
            .single()

          if (newProfile) {
            setProfile({ ...newProfile, email: user.email || '' })
          }
        }

        const { data: logsData } = await supabase
          .from('logs')
          .select('*, climbs(name, grade, image_url, crags(name))')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })

        const logsWithPoints = logsData?.map(log => ({
          ...log,
          points: log.status === 'flash'
            ? getGradePoints(log.climbs?.grade || '6A') + 10
            : getGradePoints(log.climbs?.grade || '6A')
        })) || []

        setLogs(logsWithPoints)
        setStats(calculateStats(logsWithPoints))
      }
      setLoading(false)
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
  const displayGrades = ['6A', '6A+', '6B', '6B+', '6C', '6C+', '7A', '7A+', '7B', '7B+', '7C', '7C+', '8A', '8A+', '8B', '8B+', '8C', '8C+']
  const pyramidGrades = displayGrades.slice(displayGrades.indexOf(lowestGrade))

  const averageGrade = stats?.averageGrade || '6A'
  const averagePoints = stats?.twoMonthAverage || getGradePoints(averageGrade)
  const nextGrade = getNextGrade(averageGrade)
  const previousGrade = getPreviousGrade(averageGrade)
  const previousGradePoints = getGradePoints(previousGrade)
  const nextGradePoints = getGradePoints(nextGrade)

  const username = profile?.username || user?.email?.split('@')[0] || 'Climber'
  const initials = getInitials(username)

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

      <Card className="mb-8">
        <CardContent className="pt-6">
          <div className="flex flex-col items-center">
            <ProfileAvatar
              ref={profileAvatarRef}
              avatarUrl={profile?.avatar_url}
              initials={initials}
              averageGrade={averageGrade}
              averagePoints={averagePoints}
              previousGrade={previousGrade}
              nextGrade={nextGrade}
              previousGradePoints={previousGradePoints}
              nextGradePoints={nextGradePoints}
              username={username}
              firstName={profile?.first_name}
              lastName={profile?.last_name}
              gender={profile?.gender}
              onAvatarUpdate={(url) => {
                setProfile(prev => prev ? { ...prev, avatar_url: url } : null)
              }}
              onUsernameUpdate={(newUsername, newFirstName, newLastName, newGender) => {
                setProfile(prev => prev ? {
                  ...prev,
                  username: newUsername,
                  first_name: newFirstName,
                  last_name: newLastName,
                  gender: newGender
                } : null)
              }}
            />
          </div>

          {stats && (
            <div className="grid grid-cols-4 gap-3 mt-8">
              <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{stats.totalClimbs}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Climbs</p>
              </div>
              <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-green-600 dark:text-green-400">{stats.totalFlashes}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Flashes</p>
              </div>
              <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{stats.totalTops}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Tops</p>
              </div>
              <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">{stats.totalTries}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Tries</p>
              </div>
            </div>
          )}

          <div className="mt-4">
            <Button
              variant="outline"
              onClick={() => profileAvatarRef.current?.openProfileEdit()}
              className="w-full"
            >
              Edit Profile
            </Button>
          </div>

          <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
            <nav className="flex gap-4 text-sm">
              <Link href="/privacy" className="text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100">
                Privacy
              </Link>
              <Link href="/terms" className="text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100">
                Terms
              </Link>
              <a href="mailto:hello@gsyrocks.com" className="text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100">
                Contact
              </a>
            </nav>
          </div>
        </CardContent>
      </Card>

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
                      <span className={`px-2 py-1 rounded text-sm font-medium ${statusStyles[log.status as keyof typeof statusStyles]}`}>
                        {log.status === 'flash' && '⚡ '}
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
                      <p className="font-medium text-gray-900 dark:text-gray-100">{log.climbs?.name}</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {log.climbs?.crags?.name} • {new Date(log.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-sm font-medium ${statusStyles[log.status as keyof typeof statusStyles]}`}>
                      {log.status === 'flash' && '⚡ '}
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

      <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
        <nav className="flex justify-center gap-6 text-sm">
          <Link href="/privacy" className="text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100">Privacy</Link>
          <Link href="/terms" className="text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100">Terms</Link>
          <a href="mailto:hello@gsyrocks.com" className="text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100">Contact</a>
        </nav>
      </div>
    </div>
  )
}
