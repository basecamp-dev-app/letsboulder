'use client'

import { useEffect, useState, Suspense } from 'react'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import GradeHistoryChart from '@/components/GradeHistoryChart'
import GradePyramid from '@/components/GradePyramid'
import ProfileAvatar from '@/components/ProfileAvatar'
import { getGradePoints, calculateStats, getLowestGrade, getGradeFromPoints, getNextGrade, getPreviousGrade } from '@/lib/grades'

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

function LogbookContent() {
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<ProfileData | null>(null)
  const [logs, setLogs] = useState<LoggedClimb[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const searchParams = useSearchParams()

  const handleDeleteLog = async (logId: string) => {
    if (!confirm('Remove this climb from your logbook?')) return
    
    setDeletingId(logId)
    try {
      const response = await fetch(`/api/logs/${logId}`, { method: 'DELETE' })
      if (!response.ok) throw new Error('Failed to delete')
      
      const updatedLogs = logs.filter(log => log.id !== logId)
      setLogs(updatedLogs)
      setStats(calculateStats(updatedLogs))
    } catch (error) {
      console.error('Failed to delete log:', error)
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
        // Fetch profile data
        const { data: profileData } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single()

        if (profileData) {
          setProfile({
            ...profileData,
            email: user.email || '',
          })
        } else {
          // Create profile if it doesn't exist
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
            setProfile({
              ...newProfile,
              email: user.email || '',
            })
          }
        }

        // Fetch logs
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
      alert('Payment successful! You are now a Pro member.')
    }
    if (searchParams.get('canceled')) {
      alert('Payment canceled. No worries, try again when ready!')
    }
  }, [searchParams])

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8 text-center text-gray-900 dark:text-gray-100">
        Loading...
      </div>
    )
  }

  if (!user) {
    return (
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold mb-8 text-gray-900 dark:text-gray-100">My Climbing Logbook</h1>
        <div className="bg-white dark:bg-gray-900 p-6 rounded shadow">
          <p className="text-gray-600 dark:text-gray-400 mb-4">Please login to view your logbook.</p>
          <Link href="/auth" className="inline-block bg-gray-200 dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-4 py-2 rounded hover:bg-gray-300 dark:hover:bg-gray-700 transition-colors">
            Login
          </Link>
        </div>
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

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Profile Header */}
      <div className="bg-white dark:bg-gray-900 rounded-lg shadow p-6 mb-8">
        <div className="flex flex-col items-center">
          <ProfileAvatar
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

        {/* Stats Summary Row */}
        {stats && (
          <div className="grid grid-cols-4 gap-3 mt-6">
            <div className="bg-gray-100 dark:bg-gray-800 p-3 rounded-lg text-center">
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{stats.totalClimbs}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Climbs</p>
            </div>
            <div className="bg-gray-100 dark:bg-gray-800 p-3 rounded-lg text-center">
              <p className="text-2xl font-bold text-green-600 dark:text-green-400">{stats.totalFlashes}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Flashes</p>
            </div>
            <div className="bg-gray-100 dark:bg-gray-800 p-3 rounded-lg text-center">
              <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{stats.totalTops}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Tops</p>
            </div>
            <div className="bg-gray-100 dark:bg-gray-800 p-3 rounded-lg text-center">
              <p className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">{stats.totalTries}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Tries</p>
            </div>
          </div>
        )}

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
      </div>

      <h1 className="text-3xl font-bold mb-8 text-gray-900 dark:text-gray-100">Logbook</h1>

      {stats && stats.totalClimbs === 0 ? (
        <div className="bg-white dark:bg-gray-900 p-6 rounded shadow">
          <p className="text-gray-600 dark:text-gray-400 mb-4">No logs yet. Go to the map and log some climbs!</p>
          <Link href="/map" className="inline-block bg-gray-200 dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-4 py-2 rounded hover:bg-gray-300 dark:hover:bg-gray-700 transition-colors">
            Go to Map
          </Link>
        </div>
      ) : stats ? (
        <div className="space-y-8">
          {/* Top 10 Hardest (Last 60 Days) */}
          <div className="bg-white dark:bg-gray-900 rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-gray-100">
              Top 10 Hardest (Last 60 Days)
            </h2>
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
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-1 rounded text-sm font-medium ${
                        log.status === 'flash' 
                          ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' 
                          : log.status === 'top'
                          ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
                          : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
                      }`}>
                        {log.status === 'flash' && '⚡ '}
                        {log.climbs?.grade}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 dark:text-gray-400">No climbs logged in the last 60 days</p>
            )}
          </div>

          {/* 2-Month Average */}
          <div className="bg-white dark:bg-gray-900 rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-gray-100">
              2-Month Average
            </h2>
            <p className="text-3xl font-bold text-gray-900 dark:text-gray-100">
              {getGradeFromPoints(stats.twoMonthAverage)}
              <span className="text-lg font-normal text-gray-500 dark:text-gray-400 ml-2">
                ({stats.totalFlashes} flashes, {stats.totalTops} tops)
              </span>
            </p>
          </div>

          {/* Grade History Chart */}
          <div className="bg-white dark:bg-gray-900 rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-gray-100">
              Grade History (Last 365 Days)
            </h2>
            {stats.gradeHistory.length > 0 ? (
              <GradeHistoryChart data={stats.gradeHistory} />
            ) : (
              <p className="text-gray-500 dark:text-gray-400">No data for the past year</p>
            )}
          </div>

          {/* Grade Pyramid */}
          <div className="bg-white dark:bg-gray-900 rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-gray-100">
              Grade Pyramid (Past Year)
            </h2>
            <GradePyramid pyramid={stats.gradePyramid} lowestGrade={lowestGrade} />
          </div>

          {/* Recent Logs */}
          <div className="bg-white dark:bg-gray-900 rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-gray-100">
              Recent Climbs
            </h2>
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
                  <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                    log.status === 'flash'
                      ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                      : log.status === 'top'
                      ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
                      : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
                  }`}>
                    {log.status === 'flash' && '⚡ '}
                    {log.climbs?.grade}
                  </span>
                  {deletingId === log.id ? (
                    <span className="text-gray-400">...</span>
                  ) : (
                    <button
                      onClick={() => handleDeleteLog(log.id)}
                      className="text-gray-400 hover:text-red-500 p-1 ml-2"
                      title="Remove from logbook"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function LoadingFallback() {
  return (
    <div className="container mx-auto px-4 py-8 text-center text-gray-900 dark:text-gray-100">
      Loading...
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
