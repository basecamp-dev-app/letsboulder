import type { Metadata } from 'next'
import { ImpactCard } from '@/components/metrics/impact-card'
import {
  getActiveClimbersCount,
  getCommunityContributorsCount,
  getCragsMappedCount,
  getCommunityPhotosCount,
  getTotalClimbsCount,
  getTotalSendsCount,
} from '@/lib/supabase-server'
import { Camera, CheckCircle, MapPinned, Mountain, Trophy, Users } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Community Impact',
  description: 'See the collective impact of our climbing community. Documented routes, mapped crags, successful sends, and community contributions.',
  keywords: ['climbing community', 'route documentation', 'impact metrics', 'climbing stats'],
}

export const revalidate = 60

export default async function ImpactPage() {
  const [
    totalClimbs,
    cragsMapped,
    totalSends,
    activeClimbers,
    communityPhotos,
    communityContributors,
  ] =
    await Promise.all([
      getTotalClimbsCount(),
      getCragsMappedCount(),
      getTotalSendsCount(),
      getActiveClimbersCount(),
      getCommunityPhotosCount(),
      getCommunityContributorsCount(),
    ])

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950">
      <div className="container mx-auto max-w-6xl px-4 py-12">
        <div className="mb-8 flex justify-center">
          <div className="inline-flex items-center justify-center rounded-full bg-gray-100 p-3 dark:bg-gray-800">
            <Mountain className="h-8 w-8 text-gray-700 dark:text-gray-300" />
          </div>
        </div>

        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 md:text-4xl">
            Community Impact
          </h1>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          <ImpactCard
            title="Routes Documented"
            value={totalClimbs}
            icon={<CheckCircle className="w-5 h-5" />}
            className="rounded-3xl border border-gray-200 dark:border-gray-800"
          />
          <ImpactCard
            title="Crags Mapped"
            value={cragsMapped}
            icon={<MapPinned className="w-5 h-5" />}
            className="rounded-3xl border border-gray-200 dark:border-gray-800"
          />
          <ImpactCard
            title="Sends Logged"
            value={totalSends}
            icon={<Trophy className="w-5 h-5" />}
            className="rounded-3xl border border-gray-200 dark:border-gray-800"
          />
          <ImpactCard
            title="Active Climbers"
            value={activeClimbers}
            icon={<Mountain className="w-5 h-5" />}
            className="rounded-3xl border border-gray-200 dark:border-gray-800"
          />
          <ImpactCard
            title="Community Photos"
            value={communityPhotos}
            icon={<Camera className="w-5 h-5" />}
            className="rounded-3xl border border-gray-200 dark:border-gray-800"
          />
          <ImpactCard
            title="Community Contributors"
            value={communityContributors}
            icon={<Users className="w-5 h-5" />}
            className="rounded-3xl border border-gray-200 dark:border-gray-800"
          />
        </div>
      </div>
    </div>
  )
}
