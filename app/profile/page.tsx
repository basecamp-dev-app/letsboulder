'use client'

import { useEffect, useState, Suspense } from 'react'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import ProgressRing from '@/components/ProgressRing'
import { getInitials, getGradePoints, getNextGrade, getPreviousGrade, getProgressPercent, calculateStats } from '@/lib/grades'

interface ProfileData {
  id: string
  username: string
  avatar_url?: string
  email: string
  created_at: string
  logs?: any[]
}

function ProfileContent() {
  const [profile, setProfile] = useState<ProfileData | null>(null)
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<any>(null)
  const searchParams = useSearchParams()

  useEffect(() => {
    const fetchProfile = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      
      if (!user) {
        setLoading(false)
        return
      }

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

      // Fetch logs for stats
      const { data: logs } = await supabase
        .from('logs')
        .select('*, climbs(name, grade, image_url, crags(name))')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })

      if (logs) {
        setStats(calculateStats(logs))
      }

      setLoading(false)
    }

    fetchProfile()
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

  if (!profile) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold mb-4 text-gray-900 dark:text-gray-100">Profile</h1>
          <p className="mb-4 text-gray-700 dark:text-gray-300">You need to be logged in to view your profile.</p>
          <Link href="/auth" className="inline-block bg-gray-200 dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-4 py-2 rounded hover:bg-gray-300 dark:hover:bg-gray-700 transition-colors">
            Login
          </Link>
        </div>
      </div>
    )
  }

  const initials = getInitials(profile.username || profile.email?.split('@')[0] || 'U')
  const averageGrade = stats?.averageGrade || '6A'
  const averagePoints = stats?.twoMonthAverage || getGradePoints(averageGrade)
  const nextGrade = getNextGrade(averageGrade)
  const previousGrade = getPreviousGrade(averageGrade)
  const previousGradePoints = getGradePoints(previousGrade)
  const nextGradePoints = getGradePoints(nextGrade)

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Profile Header */}
      <div className="flex flex-col items-center mb-8">
        <ProgressRing
          avatarUrl={profile.avatar_url}
          initials={initials}
          averageGrade={averageGrade}
          averagePoints={averagePoints}
          previousGrade={previousGrade}
          nextGrade={nextGrade}
          previousGradePoints={previousGradePoints}
          nextGradePoints={nextGradePoints}
        />
        <h1 className="text-2xl font-bold mt-4 text-gray-900 dark:text-gray-100">
          {profile.username || profile.email?.split('@')[0]}
        </h1>
        <p className="text-gray-600 dark:text-gray-400">{profile.email}</p>
      </div>

      {/* Stats Summary */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white dark:bg-gray-900 p-4 rounded-lg shadow text-center">
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{stats.totalClimbs}</p>
            <p className="text-sm text-gray-600 dark:text-gray-400">Total Climbs</p>
          </div>
          <div className="bg-white dark:bg-gray-900 p-4 rounded-lg shadow text-center">
            <p className="text-2xl font-bold text-green-600 dark:text-green-400">{stats.totalFlashes}</p>
            <p className="text-sm text-gray-600 dark:text-gray-400">Flashes</p>
          </div>
          <div className="bg-white dark:bg-gray-900 p-4 rounded-lg shadow text-center">
            <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{stats.totalTops}</p>
            <p className="text-sm text-gray-600 dark:text-gray-400">Tops</p>
          </div>
          <div className="bg-white dark:bg-gray-900 p-4 rounded-lg shadow text-center">
            <p className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">{stats.totalTries}</p>
            <p className="text-sm text-gray-600 dark:text-gray-400">Tries</p>
          </div>
        </div>
      )}

      {/* Navigation */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Link href="/logbook" className="bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 p-6 rounded-lg shadow transition-colors">
          <h3 className="text-lg font-semibold mb-2 text-gray-900 dark:text-gray-100">My Logbook</h3>
          <p className="text-gray-600 dark:text-gray-400">View and manage your climbing logbook</p>
        </Link>

        <Link href="/upload" className="bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 p-6 rounded-lg shadow transition-colors">
          <h3 className="text-lg font-semibold mb-2 text-gray-900 dark:text-gray-100">Upload Route</h3>
          <p className="text-gray-600 dark:text-gray-400">Add new climbing routes to the map</p>
        </Link>
      </div>
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

export default function ProfilePage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <ProfileContent />
    </Suspense>
  )
}
