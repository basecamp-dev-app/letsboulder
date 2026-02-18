'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { Loader2 } from 'lucide-react'

import { createClient } from '@/lib/supabase'

interface RouteLink {
  id: string
  climb_id: string
}

export default function ImageRedirectPage() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const imageId = params.id as string

  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const redirectToClimb = async () => {
      if (!imageId) return

      setError(null)

      try {
        const supabase = createClient()
        const requestedRouteId = searchParams.get('route')
        const requestedTab = searchParams.get('tab')

        let routeLink: RouteLink | null = null

        if (requestedRouteId) {
          const { data: requestedRoute } = await supabase
            .from('route_lines')
            .select('id, climb_id')
            .eq('id', requestedRouteId)
            .eq('image_id', imageId)
            .maybeSingle()

          routeLink = (requestedRoute as RouteLink | null) ?? null
        }

        if (!routeLink) {
          const { data: firstRoute, error: firstRouteError } = await supabase
            .from('route_lines')
            .select('id, climb_id')
            .eq('image_id', imageId)
            .order('created_at', { ascending: true })
            .limit(1)
            .maybeSingle()

          if (firstRouteError) throw firstRouteError
          routeLink = (firstRoute as RouteLink | null) ?? null
        }

        if (!routeLink?.climb_id) {
          setError('No climb routes found for this image')
          return
        }

        const next = new URLSearchParams()
        next.set('route', routeLink.id)
        if (requestedTab === 'tops' || requestedTab === 'climb') {
          next.set('tab', requestedTab)
        }

        router.replace(`/climb/${routeLink.climb_id}?${next.toString()}`)
      } catch (err) {
        console.error('Failed to redirect image page:', err)
        setError('Failed to open climb page')
      }
    }

    redirectToClimb()
  }, [imageId, router, searchParams])

  if (error) {
    return (
      <div className="min-h-screen bg-white dark:bg-gray-950 flex items-center justify-center px-4">
        <div className="text-center space-y-3">
          <p className="text-red-600 dark:text-red-400">{error}</p>
          <button
            onClick={() => router.push('/map')}
            className="px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 dark:bg-gray-800 dark:hover:bg-gray-700"
          >
            Back to Map
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950 flex items-center justify-center">
      <Loader2 className="w-8 h-8 animate-spin text-gray-500 dark:text-gray-400" />
    </div>
  )
}
