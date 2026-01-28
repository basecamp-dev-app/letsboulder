import type { Metadata } from 'next'
import { ImpactCard } from '@/components/metrics/impact-card'
import {
  getTotalClimbsCount,
  getTotalLogsCount,
  getCommunityPhotosCount,
} from '@/lib/supabase-server'
import { CheckCircle, Mountain, Camera } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Community Impact',
  description: 'See the collective impact of our climbing community. Documented routes, logged climbs, and shared photos.',
  keywords: ['climbing community', 'route documentation', 'impact metrics', 'climbing stats'],
}

export const revalidate = 60

export default async function ImpactPage() {
  const [totalClimbs, totalLogs, communityPhotos] =
    await Promise.all([
      getTotalClimbsCount(),
      getTotalLogsCount(),
      getCommunityPhotosCount(),
    ])

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950">
      <div className="container mx-auto px-4 py-12 max-w-4xl">
        <div className="mb-12 text-center">
          <div className="inline-flex items-center justify-center p-3 bg-gray-100 dark:bg-gray-800 rounded-full mb-4">
            <Mountain className="w-8 h-8 text-gray-700 dark:text-gray-300" />
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-gray-100 mb-3">
            Community Pulse
          </h1>
          <p className="text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto hidden">
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-0 divide-x divide-y divide-gray-200 dark:divide-gray-800 border border-gray-200 dark:border-gray-800">
          <ImpactCard
            title="Routes Documented"
            value={totalClimbs}
            icon={<CheckCircle className="w-5 h-5" />}
          />
          <ImpactCard
            title="Climbs Logged"
            value={totalLogs}
            icon={<Mountain className="w-5 h-5" />}
          />
          <ImpactCard
            title="Community Photos"
            value={communityPhotos}
            icon={<Camera className="w-5 h-5" />}
          />
        </div>
      </div>
    </div>
  )
}
