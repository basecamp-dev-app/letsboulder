'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import GradeHistoryChart from '@/components/GradeHistoryChart'
import GradePyramid from '@/components/GradePyramid'
import { calculateStats, getLowestGrade, getGradeFromPoints } from '@/lib/grades'
import { Trash2, Loader2, Mountain } from 'lucide-react'
import { ToastContainer, useToast } from '@/components/logbook/toast'

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
}

interface LogbookViewProps {
  userId: string
  isOwnProfile: boolean
  initialLogs?: Climb[]
  profile?: Profile
}

export default function LogbookView({ isOwnProfile, initialLogs = [] }: LogbookViewProps) {
  const [logs, setLogs] = useState<Climb[]>(initialLogs)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const { toasts, addToast, removeToast } = useToast()

  const stats = logs.length > 0 ? calculateStats(logs) : null
  const lowestGrade = stats ? getLowestGrade(stats.gradePyramid) : '6A'

  const handleDeleteLog = async (logId: string) => {
    setDeletingId(logId)
    try {
      const response = await fetch(`/api/logs/${logId}`, { method: 'DELETE' })
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
    <div className="container mx-auto px-4 py-8">
      <ToastContainer toasts={toasts} onRemove={removeToast} />

      {logs.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 px-4">
            <div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-4">
              <Mountain className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
              {isOwnProfile ? 'No climbs logged yet' : 'No climbs logged'}
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center mb-6 max-w-sm">
              {isOwnProfile
                ? 'Start tracking your progress by visiting the map and logging your first climb.'
                : 'This climber hasn\'t logged any climbs yet.'}
            </p>
            {isOwnProfile && (
              <Link href="/map">
                <Button className="gap-2">
                  Go to Map
                </Button>
              </Link>
            )}
          </CardContent>
        </Card>
      ) : stats ? (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Top 10 Hardest (Last 60 Days)</CardTitle>
            </CardHeader>
            <CardContent>
              {stats.top10Hardest.length > 0 ? (
                <div className="space-y-2">
                  {stats.top10Hardest.map((log: any, index: number) => (
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
        </div>
      ) : null}
    </div>
  )
}
