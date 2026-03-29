'use client'

import dynamic from 'next/dynamic'

const TopThisPlacePanel = dynamic(() => import('@/features/community/components/TopThisPlacePanel'))
const PlaceRankingsPanel = dynamic(() => import('@/features/community/components/PlaceRankingsPanel'))

interface CragCommunitySidebarProps {
  communityPlaceSlug?: string | null
}

export default function CragCommunitySidebar({ communityPlaceSlug }: CragCommunitySidebarProps) {
  return (
    <section className="space-y-4">
      <div className="mb-6 space-y-4">
        {communityPlaceSlug ? (
          <>
            <TopThisPlacePanel slug={communityPlaceSlug} />
            <PlaceRankingsPanel slug={communityPlaceSlug} />
          </>
        ) : (
          <div className="rounded-xl border border-dashed border-gray-300 p-5 text-sm text-gray-600 dark:border-gray-700 dark:text-gray-400">
            Rankings are not available for this crag yet.
          </div>
        )}
      </div>
    </section>
  )
}
