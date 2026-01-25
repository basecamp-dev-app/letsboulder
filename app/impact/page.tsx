import type { Metadata } from 'next'
import { ImpactCard } from '@/components/metrics/impact-card'
import {
  getTotalClimbsCount,
  getTotalLogsCount,
  getCommunityPhotosCount,
} from '@/lib/supabase-server'
import { CheckCircle, Mountain, Camera } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Community Impact | gsyrocks',
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
          <p className="text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
            Together, we&apos;re building the most comprehensive bouldering database. Here&apos;s our collective impact.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-0 divide-x divide-y divide-gray-200 dark:divide-gray-800 border border-gray-200 dark:border-gray-800">
          <ImpactCard
            title="Routes Documented"
            value={totalClimbs}
            description="Routes in our database"
            icon={<CheckCircle className="w-5 h-5" />}
          />
          <ImpactCard
            title="Climbs Logged"
            value={totalLogs}
            description="Total entries in logbooks"
            icon={<Mountain className="w-5 h-5" />}
          />
          <ImpactCard
            title="Community Photos"
            value={communityPhotos}
            description="Photos shared"
            icon={<Camera className="w-5 h-5" />}
          />
        </div>

        <div className="mt-12 p-6 bg-gray-50 dark:bg-gray-900 rounded-xl">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-3">
            Why This Matters
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-gray-600 dark:text-gray-400">
            <div>
              <h3 className="font-medium text-gray-900 dark:text-gray-100 mb-2"> Democratized Grade Consensus</h3>
              <p className="text-sm">
                Our 3+ verification system means grades reflect community wisdom, not just one person&apos;s opinion.
              </p>
            </div>
            <div>
              <h3 className="font-medium text-gray-900 dark:text-gray-100 mb-2"> Preserving Climbing History</h3>
              <p className="text-sm">
                By documenting routes and sharing photos, we&apos;re preserving climbing areas for future generations.
              </p>
            </div>
          </div>
        </div>

        <div className="mt-8 text-center">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Last updated: {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
          </p>
        </div>
      </div>
    </div>
  )
}
