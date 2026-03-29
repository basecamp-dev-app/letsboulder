'use client'

import { useState, useEffect, useCallback } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import type { Session, User } from '@supabase/supabase-js'
import { Card, CardContent } from '@/components/ui/card'
import { useGradeSystem } from '@/features/grades/hooks/useGradeSystem'
import { createClient } from '@/lib/supabase'
import { formatGradeForDisplay } from '@/lib/grade-display'

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
  const gradeSystem = useGradeSystem()
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
      (_event: string, session: Session | null) => {
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
                className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  sortBy === 'grade'
                    ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
                    : 'text-gray-600 dark:text-gray-400'
                }`}
              >
                Avg Grade
              </button>
              <button
                onClick={() => {
                  setSortBy('tops')
                  setPage(1)
                }}
                className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  sortBy === 'tops'
                    ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
                    : 'text-gray-600 dark:text-gray-400'
                }`}
              >
                Most Tops
              </button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="px-4 py-4 space-y-3">
        {loading ? (
          Array.from({ length: 10 }).map((_, index) => (
            <Card key={index}>
              <CardContent className="p-4">
                <div className="animate-pulse flex items-center gap-4">
                  <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-800" />
                  <div className="w-12 h-12 rounded-full bg-gray-200 dark:bg-gray-800" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-32 bg-gray-200 dark:bg-gray-800 rounded" />
                    <div className="h-3 w-20 bg-gray-200 dark:bg-gray-800 rounded" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        ) : (
          leaderboard.map((entry) => (
            <Card key={entry.user_id}>
              <CardContent className="p-4">
                <div className="flex items-center gap-4">
                  <RankBadge rank={entry.rank} />
                  <Link href={`/logbook/${entry.user_id}`} className="relative w-12 h-12 rounded-full overflow-hidden bg-gray-100 dark:bg-gray-800 shrink-0">
                    {entry.avatar_url ? (
                      <Image src={entry.avatar_url} alt={entry.username} fill className="object-cover" sizes="48px" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-lg font-semibold text-gray-500 dark:text-gray-400">
                        {entry.username.charAt(0).toUpperCase()}
                      </div>
                    )}
                  </Link>
                  <div className="min-w-0 flex-1">
                    <Link href={`/logbook/${entry.user_id}`} className="font-semibold text-gray-900 dark:text-gray-100 hover:underline truncate block">
                      {entry.username}
                    </Link>
                    <div className="mt-1 flex items-center gap-3 text-sm text-gray-600 dark:text-gray-400">
                      <span>{formatGradeForDisplay(entry.avg_grade, gradeSystem)}</span>
                      <span>{entry.climb_count} tops</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {pagination && pagination.total_pages > 1 && (
        <div className="px-4 pb-8 flex items-center justify-center gap-2">
          <button
            onClick={() => setPage((value) => Math.max(1, value - 1))}
            disabled={page === 1}
            className="px-4 py-2 rounded-lg border border-gray-300 text-sm disabled:opacity-50 dark:border-gray-700"
          >
            Previous
          </button>
          <span className="text-sm text-gray-600 dark:text-gray-400">
            Page {pagination.page} of {pagination.total_pages}
          </span>
          <button
            onClick={() => setPage((value) => Math.min(pagination.total_pages, value + 1))}
            disabled={page === pagination.total_pages}
            className="px-4 py-2 rounded-lg border border-gray-300 text-sm disabled:opacity-50 dark:border-gray-700"
          >
            Next
          </button>
        </div>
      )}
    </div>
  )
}
