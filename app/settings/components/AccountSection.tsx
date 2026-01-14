'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import { User } from '@supabase/supabase-js'
import ProfileAvatar, { ProfileAvatarRef } from '@/components/ProfileAvatar'
import { getGradePoints } from '@/lib/grades'

interface AccountSectionProps {
  user: User | null
}

interface ProfileData {
  username?: string
  avatar_url?: string
  name?: string
  gender?: string
  bio?: string
  default_location?: string
}

export function AccountSection({ user }: AccountSectionProps) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [profile, setProfile] = useState<ProfileData | null>(null)
  const [stats, setStats] = useState<{ totalClimbs: number; totalFlashes: number; totalTops: number; totalTries: number; averageGrade: string } | null>(null)
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    gender: '',
    bio: '',
    defaultLocation: ''
  })
  const profileAvatarRef = useRef<ProfileAvatarRef>(null)

  const averageGrade = stats?.averageGrade || '6A'
  const averagePoints = getGradePoints(averageGrade)
  const nextGrade = getNextGrade(averageGrade)
  const previousGrade = getPreviousGrade(averageGrade)
  const previousGradePoints = getGradePoints(previousGrade)
  const nextGradePoints = getNextGradePoints(nextGrade)

  useEffect(() => {
    const fetchData = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) return

      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()

      if (profileData) {
        setProfile(profileData)
        setFormData({
          firstName: profileData.name || '',
          lastName: '',
          gender: profileData.gender || '',
          bio: profileData.bio || '',
          defaultLocation: profileData.default_location || ''
        })
      }

      const { data: logsData } = await supabase
        .from('user_climbs')
        .select('*')
        .eq('user_id', user.id)

      if (logsData && logsData.length > 0) {
        const totalClimbs = logsData.length
        const totalFlashes = logsData.filter(l => l.style === 'flash').length
        const totalTops = logsData.filter(l => l.style === 'top').length
        const totalTries = logsData.filter(l => l.style === 'try').length

        const twoMonthsAgo = new Date()
        twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2)
        const recentLogs = logsData.filter(l => new Date(l.created_at) >= twoMonthsAgo)

        let totalPoints = 0
        recentLogs.forEach(log => {
          const gradePoints = getGradePoints('6A')
          totalPoints += log.style === 'flash' ? gradePoints + 10 : gradePoints
        })

        const avgPoints = recentLogs.length > 0 ? Math.round(totalPoints / recentLogs.length) : getGradePoints('6A')

        setStats({
          totalClimbs,
          totalFlashes,
          totalTops,
          totalTries,
          averageGrade: getGradeFromPoints(avgPoints)
        })
      }

      setLoading(false)
    }

    fetchData()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setMessage(null)

    try {
      const response = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      })

      if (!response.ok) throw new Error('Failed to save')

      setMessage({ type: 'success', text: 'Settings saved successfully' })
    } catch {
      setMessage({ type: 'error', text: 'Failed to save settings' })
    } finally {
      setSaving(false)
    }
  }

  const username = profile?.username || user?.email?.split('@')[0] || 'Climber'
  const initials = username.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)

  if (loading) {
    return <div className="animate-pulse space-y-4"><div className="h-10 bg-gray-200 dark:bg-gray-800 rounded" /><div className="h-10 bg-gray-200 dark:bg-gray-800 rounded" /><div className="h-32 bg-gray-200 dark:bg-gray-800 rounded" /></div>
  }

  return (
    <div className="space-y-6">
      {stats && (
        <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 p-6">
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
              firstName={profile?.name || ''}
              lastName=""
              gender={profile?.gender}
              onAvatarUpdate={(url) => {
                setProfile(prev => prev ? { ...prev, avatar_url: url } : null)
              }}
              onUsernameUpdate={(newUsername, newFirstName, _newLastName, newGender) => {
                setProfile(prev => prev ? {
                  ...prev,
                  username: newUsername,
                  name: newFirstName,
                  gender: newGender
                } : null)
              }}
            />

            <div className="grid grid-cols-4 gap-3 mt-6 w-full">
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

            <button
              onClick={() => profileAvatarRef.current?.openProfileEdit()}
              className="mt-4 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              Edit Profile
            </button>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Account Information</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">Update your profile information below.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">First Name</label>
            <input
              type="text"
              value={formData.firstName}
              onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-gray-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Last Name</label>
            <input
              type="text"
              value={formData.lastName}
              onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-gray-500 focus:border-transparent"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Gender</label>
          <select
            value={formData.gender}
            onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-gray-500 focus:border-transparent"
          >
            <option value="">Prefer not to say</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="other">Other</option>
          </select>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Used for segmented leaderboards</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Bio</label>
          <textarea
            value={formData.bio}
            onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
            rows={4}
            maxLength={500}
            placeholder="Tell us about yourself..."
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-gray-500 focus:border-transparent resize-none"
          />
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{formData.bio.length}/500 characters</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Default Location</label>
          <input
            type="text"
            value={formData.defaultLocation}
            onChange={(e) => setFormData({ ...formData, defaultLocation: e.target.value })}
            placeholder="e.g., Fontainebleau, France"
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-gray-500 focus:border-transparent"
          />
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Your primary climbing location</p>
        </div>

        {message && (
          <div className={`p-3 rounded-lg text-sm ${message.type === 'success' ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400' : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400'}`}>
            {message.text}
          </div>
        )}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded-lg font-medium hover:bg-gray-800 dark:hover:bg-gray-200 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </form>
    </div>
  )
}

function getNextGrade(current: string): string {
  const grades = ['6A', '6A+', '6B', '6B+', '6C', '6C+', '7A', '7A+', '7B', '7B+', '7C', '7C+', '8A', '8A+', '8B', '8B+', '8C', '8C+']
  const idx = grades.indexOf(current)
  return idx >= 0 && idx < grades.length - 1 ? grades[idx + 1] : current
}

function getPreviousGrade(current: string): string {
  const grades = ['6A', '6A+', '6B', '6B+', '6C', '6C+', '7A', '7A+', '7B', '7B+', '7C', '7C+', '8A', '8A+', '8B', '8B+', '8C', '8C+']
  const idx = grades.indexOf(current)
  return idx > 0 ? grades[idx - 1] : current
}

function getNextGradePoints(grade: string): number {
  return getGradePoints(grade)
}

function getGradeFromPoints(points: number): string {
  const grades = ['6A', '6A+', '6B', '6B+', '6C', '6C+', '7A', '7A+', '7B', '7B+', '7C', '7C+', '8A', '8A+', '8B', '8B+', '8C', '8C+']
  const pointsMap: Record<string, number> = {}
  const basePoints = 100
  grades.forEach((grade, i) => {
    pointsMap[grade] = basePoints + (i * 15)
  })
  
  let closest = '6A'
  let closestDiff = Math.abs(points - pointsMap[closest])
  
  Object.entries(pointsMap).forEach(([grade, pts]) => {
    const diff = Math.abs(points - pts)
    if (diff < closestDiff) {
      closest = grade
      closestDiff = diff
    }
  })
  
  return closest
}
