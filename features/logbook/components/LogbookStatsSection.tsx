'use client'

import dynamic from 'next/dynamic'
import Link from 'next/link'
import Image from 'next/image'
import { Loader2, Trash2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import GradePyramid from '@/components/GradePyramid'
import { formatGradeForDisplay } from '@/lib/grade-display'
import { getGradeFromPoints, type GradeSystem } from '@/lib/grades'
import { resolveRouteImageUrl } from '@/lib/media/route-image-url'
import { statusStyles, type LogEntry, type LogbookClimb, type LogbookStats } from '@/features/logbook/lib/logbook-view'

const ProgressOverTimeChart = dynamic(() => import('@/features/logbook/components/ProgressOverTimeChart'), {
  ssr: false,
  loading: () => <div className="h-72 flex items-center justify-center text-gray-400">Loading progress chart...</div>,
})

interface LogbookStatsSectionProps {
  gradeSystem: GradeSystem
  stats: LogbookStats
  lowestGrade: string
  logs: LogbookClimb[]
  recentLogs: LogbookClimb[]
  isOwnProfile: boolean
  deletingId: string | null
  onDeleteLog: (logId: string) => void | Promise<void>
  climbUrlMap?: Map<string, string>
}

const stableDateFormatter = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
})

function getClimbUrl(climbId: string, climbUrlMap?: Map<string, string>): string {
  return climbUrlMap?.get(climbId) || `/climb/${climbId}`
}

export function LogbookStatsSection({
  gradeSystem,
  stats,
  lowestGrade,
  logs,
  recentLogs,
  isOwnProfile,
  deletingId,
  onDeleteLog,
  climbUrlMap,
}: LogbookStatsSectionProps) {
  return (
    <div className="space-y-0">
      <Card className="m-0 border-x-0 border-t-0 rounded-none py-0 gap-0">
        <CardHeader className="py-2 px-4">
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="text-base">2-Month Average</CardTitle>
            <p className="text-base font-semibold text-gray-900 dark:text-gray-100 text-right whitespace-nowrap">
              {formatGradeForDisplay(getGradeFromPoints(stats.twoMonthAverage), gradeSystem)}
              <span className="text-sm font-normal text-gray-500 dark:text-gray-400 ml-2">
                ({stats.totalFlashes} flashes, {stats.totalTops} tops)
              </span>
            </p>
          </div>
        </CardHeader>
      </Card>

      <Card className="m-0 border-x-0 border-t-0 rounded-none">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Progress Over Time</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <ProgressOverTimeChart logs={logs} gradeSystem={gradeSystem} />
        </CardContent>
      </Card>

      <Card className="m-0 border-x-0 border-t-0 rounded-none">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Grade Pyramid (Past Year)</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <GradePyramid pyramid={stats.gradePyramid} lowestGrade={lowestGrade} gradeSystem={gradeSystem} />
        </CardContent>
      </Card>

      <Card className="m-0 border-x-0 border-t-0 rounded-none">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Top 10 Hardest (Last 60 Days)</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {stats.top10Hardest.length > 0 ? (
            <div className="space-y-0">
              {stats.top10Hardest.map((log: LogEntry, index: number) => (
                <div key={log.id} className="flex items-center justify-between py-3 border-b border-gray-100 dark:border-gray-800 last:border-0">
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-gray-500 dark:text-gray-400 w-6">{index + 1}.</span>
                    <Link href={getClimbUrl(log.climb_id, climbUrlMap)} prefetch={false} className="flex items-center gap-3 min-w-0 hover:opacity-90 transition-opacity">
                      {log.climbs?.image_url && (
                        <Image
                          src={resolveRouteImageUrl(log.climbs.image_url)}
                          alt={log.climbs?.name || 'Climb image'}
                          width={48}
                          height={48}
                          sizes="(max-width: 640px) 40px, 48px"
                          loading="lazy"
                          className="w-10 h-10 sm:w-12 sm:h-12 object-cover rounded shrink-0"
                        />
                      )}
                      <div className="min-w-0">
                        <p className="font-medium text-gray-900 dark:text-gray-100 hover:underline truncate">{log.climbs?.name}</p>
                        <p className="text-sm text-gray-500 dark:text-gray-400 truncate">{log.climbs?.crags?.name}</p>
                      </div>
                    </Link>
                  </div>
                  <span className={`px-2 py-1 rounded text-sm font-medium ${statusStyles[log.style] ?? ''}`}>
                    {log.style === 'flash' && '⚡ '}
                    {formatGradeForDisplay(log.climbs?.grade, gradeSystem)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 dark:text-gray-400 py-4">No climbs logged in the last 60 days</p>
          )}
        </CardContent>
      </Card>

      <Card className="m-0 border-x-0 border-t-0 rounded-none">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Recent Climbs</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="space-y-0">
            {recentLogs.map((log) => (
                <div key={log.id} className="flex items-center gap-2 sm:gap-4 py-3 border-b border-gray-100 dark:border-gray-800 last:border-0">
                  {log.climbs?.image_url && (
                    <Link href={getClimbUrl(log.climb_id, climbUrlMap)} prefetch={false} className="shrink-0">
                    <Image
                      src={resolveRouteImageUrl(log.climbs.image_url)}
                      alt={log.climbs?.name || 'Climb image'}
                      width={48}
                      height={48}
                      sizes="(max-width: 640px) 40px, 48px"
                      loading="lazy"
                      className="w-10 h-10 sm:w-12 sm:h-12 object-cover rounded"
                    />
                  </Link>
                )}
                <div className="flex-1">
                  <Link href={getClimbUrl(log.climb_id, climbUrlMap)} prefetch={false} className="hover:underline">
                    <p className="font-medium text-gray-900 dark:text-gray-100">{log.climbs?.name}</p>
                  </Link>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {log.climbs?.crags?.name} • {stableDateFormatter.format(new Date(log.created_at))}
                  </p>
                </div>
                  <span className={`px-3 py-1 rounded-full text-sm font-medium ${statusStyles[log.style] ?? ''}`}>
                    {log.style === 'flash' && '⚡ '}
                    {formatGradeForDisplay(log.climbs?.grade, gradeSystem)}
                  </span>
                  {isOwnProfile && (
                    deletingId === log.id ? (
                      <Loader2 className="ml-2 h-5 w-5 animate-spin text-gray-400" />
                    ) : (
                      <button
                        type="button"
                        onClick={() => onDeleteLog(log.id)}
                        className="ml-2 p-1 text-gray-400 transition-colors hover:text-red-500"
                        title="Remove from logbook"
                      >
                        <Trash2 className="h-5 w-5" />
                      </button>
                    )
                  )}
                </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
