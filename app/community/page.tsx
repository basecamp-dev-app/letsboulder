import type { Metadata } from 'next'
import Link from 'next/link'
import { getServerClient } from '@/lib/supabase-server'

export const metadata: Metadata = {
  title: 'Community | letsboulder',
  description: 'Connect with climbers, ask for beta, and find climbing partners.',
}

interface CommunityPlaceListItem {
  id: string
  name: string
  type: 'crag' | 'gym'
  slug: string | null
  country_code: string | null
  primary_discipline: string | null
}

export default async function CommunityPage() {
  const supabase = await getServerClient()

  const { data: places } = await supabase
    .from('places')
    .select('id, name, type, slug, country_code, primary_discipline')
    .not('slug', 'is', null)
    .order('name')
    .limit(60)

  const visiblePlaces = (places || []) as CommunityPlaceListItem[]

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950">
      <div className="container mx-auto max-w-3xl px-4 py-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Community</h1>
        <p className="mt-3 text-gray-600 dark:text-gray-400">Pick a place to see upcoming sessions and find partners.</p>

        <div className="mt-6 space-y-3">
          {visiblePlaces.length === 0 ? (
            <div className="rounded-xl border border-gray-200 p-4 text-sm text-gray-600 dark:border-gray-800 dark:text-gray-400">
              No places available yet.
            </div>
          ) : (
            visiblePlaces.map(place => (
              <Link
                key={place.id}
                href={`/community/places/${place.slug}`}
                className="block rounded-xl border border-gray-200 bg-white p-4 transition hover:border-gray-300 hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-900 dark:hover:border-gray-700 dark:hover:bg-gray-800"
              >
                <p className="font-semibold text-gray-900 dark:text-gray-100">{place.name}</p>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                  {place.type === 'gym' ? 'Gym' : 'Crag'}
                  {place.primary_discipline ? ` • ${place.primary_discipline.replace('_', ' ')}` : ''}
                  {place.country_code ? ` • ${place.country_code}` : ''}
                </p>
              </Link>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
