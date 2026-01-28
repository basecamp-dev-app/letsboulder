'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import type { User } from '@supabase/supabase-js'
import { Card, CardContent } from '@/components/ui/card'
import { trackEvent } from '@/lib/posthog'

interface LeaderboardEntry {
  rank: number
  user_id: string
  username: string
  avatar_url: string | null
  avg_points: number
  avg_grade: string
  climb_count: number
  gender: string | null
}

interface Pagination {
  page: number
  limit: number
  total_users: number
  total_pages: number
}

const GENDER_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
]

const COUNTRY_OPTIONS = [
  { value: 'all', label: 'Worldwide' },
  { value: 'Guernsey', label: 'Guernsey' },
  { value: 'UK', label: 'UK' },
  { value: 'USA', label: 'USA' },
  { value: 'France', label: 'France' },
  { value: 'Germany', label: 'Germany' },
  { value: 'Australia', label: 'Australia' },
  { value: 'Spain', label: 'Spain' },
  { value: 'Italy', label: 'Italy' },
]

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) {
    return (
      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-yellow-400 to-yellow-600 flex items-center justify-center shadow-sm">
        <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      </div>
    )
  }
  if (rank === 2) {
    return (
      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-gray-300 to-gray-500 flex items-center justify-center shadow-sm">
        <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
        </svg>
      </div>
    )
  }
  if (rank === 3) {
    return (
      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center shadow-sm">
        <span className="text-white font-bold text-sm">3</span>
      </div>
    )
  }
  return (
    <div className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-sm font-medium text-gray-600 dark:text-gray-400">
      {rank}
    </div>
  )
}

export default function LeaderboardPage() {
  const [gender, setGender] = useState('all')
  const [country, setCountry] = useState('all')
  const [sortBy, setSortBy] = useState<'grade' | 'tops'>('grade')
  const [page, setPage] = useState(1)
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [pagination, setPagination] = useState<Pagination | null>(null)
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<User | null>(null)

  const fetchLeaderboard = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch(
        `/api/rankings?gender=${gender}&country=${country}&sort=${sortBy}&page=${page}&limit=20`
      )
      const data = await response.json()
      if (response.ok) {
        setLeaderboard(data.leaderboard)
        setPagination(data.pagination)
      }
    } catch (error) {
      console.error('Failed to fetch leaderboard:', error)
    } finally {
      setLoading(false)
    }
  }, [gender, country, sortBy, page])

  useEffect(() => {
    const supabase = createClient()
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setUser(user)
    }
    getUser()
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user ?? null)
      }
    )
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    fetchLeaderboard()
  }, [gender, country, sortBy, page, fetchLeaderboard])

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 px-4 py-3 border-b border-gray-200 dark:border-gray-800 sticky top-[var(--app-header-offset)] bg-white dark:bg-gray-950 z-10 flex items-center justify-between">
        <span>Rankings</span>
        {!user && (
          <button
            onClick={() => window.location.href = '/auth'}
            className="px-4 py-1.5 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 text-sm rounded-lg font-medium"
          >
            Get Started
          </button>
        )}
      </h1>

      <Card className="m-0 border-x-0 border-t-0 rounded-none">
        <CardContent className="py-2 px-3">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <select
                value={country}
                onChange={(e) => {
                  setCountry(e.target.value)
                  setPage(1)
                }}
                className="flex-1 py-1.5 px-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
              >
                {COUNTRY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <div className="flex bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5">
                {GENDER_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => {
                      setGender(option.value)
                      setPage(1)
                    }}
                    className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                      gender === option.value
                        ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
                        : 'text-gray-600 dark:text-gray-400'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5 mx-auto">
              <button
                onClick={() => {
                  setSortBy('grade')
                  setPage(1)
                }}
                className={`px-4 py-1 text-xs font-medium rounded-md transition-colors ${
                  sortBy === 'grade'
                    ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
                    : 'text-gray-600 dark:text-gray-400'
                }`}
              >
                Grade
              </button>
              <button
                onClick={() => {
                  setSortBy('tops')
                  setPage(1)
                }}
                className={`px-4 py-1 text-xs font-medium rounded-md transition-colors ${
                  sortBy === 'tops'
                    ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
                    : 'text-gray-600 dark:text-gray-400'
                }`}
              >
                Tops
              </button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="m-0 border-x-0 border-t-0 rounded-none">
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-gray-500 text-sm">
              Loading...
            </div>
          ) : leaderboard.length === 0 ? (
            <div className="p-6 text-center">
              <p className="text-gray-500 dark:text-gray-400 text-sm mb-3">
                No climbers yet.
              </p>
              <Link
                href="/logbook"
                className="inline-block bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-4 py-2 rounded text-sm"
              >
                Log climbs
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {leaderboard.map((entry) => (
                <Link
                  key={entry.user_id}
                  href={`/logbook/${entry.user_id}`}
                  className="flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                >
                  <RankBadge rank={entry.rank} />
                  {entry.avatar_url ? (
                    <img
                      src={entry.avatar_url}
                      alt={entry.username}
                      className="w-9 h-9 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
                      <span className="text-sm font-medium text-gray-600 dark:text-gray-300">
                        {entry.username?.slice(0, 2).toUpperCase()}
                      </span>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 dark:text-gray-100 text-sm truncate">
                      {entry.username}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    {sortBy === 'grade' ? (
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200">
                        {entry.avg_grade}
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200">
                        {entry.climb_count} tops
                      </span>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {pagination && pagination.total_pages > 1 && (
        <div className="flex items-center justify-between px-4 py-2 border-t border-gray-200 dark:border-gray-800">
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {pagination.page}/{pagination.total_pages}
          </span>
          <div className="flex gap-1">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded-md text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50"
            >
              Prev
            </button>
            <button
              onClick={() => setPage(p => Math.min(pagination.total_pages, p + 1))}
              disabled={page === pagination.total_pages}
              className="px-3 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded-md text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
