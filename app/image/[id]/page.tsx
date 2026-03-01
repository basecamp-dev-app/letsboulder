import { createServerClient } from '@supabase/ssr'
import { redirect } from 'next/navigation'

interface RouteLink {
  id: string
  climb_id: string
}

async function withTimeout<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutId: NodeJS.Timeout | null = null

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`Timed out after ${timeoutMs}ms`))
    }, timeoutMs)
  })

  try {
    return await Promise.race([operation, timeoutPromise])
  } finally {
    if (timeoutId) clearTimeout(timeoutId)
  }
}

export default async function ImageRedirectPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ route?: string; tab?: string }>
}) {
  const { id: imageId } = await params
  const query = await searchParams

  if (!imageId) {
    redirect('/')
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return [] }, setAll() {} } }
  )

  let targetPath: string | null = null

  try {
    const requestedRouteId = query.route
    const requestedTab = query.tab

    const resolvedRouteLink = await withTimeout((async (): Promise<RouteLink | null> => {
      let routeLink: RouteLink | null = null

        if (requestedRouteId) {
          const { data: requestedRoute } = await supabase
            .from('route_lines')
            .select('id, climb_id')
            .eq('id', requestedRouteId)
            .eq('image_id', imageId)
            .not('climb_id', 'is', null)
            .maybeSingle()

        if (requestedRoute) {
          routeLink = requestedRoute as RouteLink
        }
      }

        if (!routeLink) {
          const { data: firstRoute, error: firstRouteError } = await supabase
            .from('route_lines')
            .select('id, climb_id')
            .eq('image_id', imageId)
            .not('climb_id', 'is', null)
            .order('sequence_order', { ascending: true, nullsFirst: false })
            .order('created_at', { ascending: true })
            .limit(1)
            .maybeSingle()

        if (firstRouteError) throw firstRouteError
        if (firstRoute) {
          routeLink = firstRoute as RouteLink
        }
      }
      return routeLink
    })(), 2500)

    if (!resolvedRouteLink?.climb_id) {
      targetPath = '/'
    } else {
      const next = new URLSearchParams()
      next.set('route', resolvedRouteLink.id)
      if (requestedTab === 'tops' || requestedTab === 'climb') {
        next.set('tab', requestedTab)
      }
      targetPath = `/climb/${resolvedRouteLink.climb_id}?${next.toString()}`
    }
  } catch (error) {
    console.error('Failed to redirect image page:', error)

    try {
      const emergencyTimeout = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Emergency timeout')), 500)
      })

      const emergencyQuery = supabase
        .from('route_lines')
        .select('climb_id')
        .eq('image_id', imageId)
        .not('climb_id', 'is', null)
        .limit(1)
        .maybeSingle()

      const emergencyResult = await Promise.race([emergencyQuery, emergencyTimeout]) as { data: { climb_id: string } | null } | null

      if (emergencyResult?.data?.climb_id) {
        const next = new URLSearchParams()
        if (query.tab === 'tops' || query.tab === 'climb') {
          next.set('tab', query.tab)
        }
        targetPath = `/climb/${emergencyResult.data.climb_id}${next.toString() ? `?${next.toString()}` : ''}`
      } else {
        targetPath = '/'
      }
    } catch {
      targetPath = '/'
    }
  }

  redirect(targetPath)
}
