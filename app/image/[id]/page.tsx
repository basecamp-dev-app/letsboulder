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
    })(), 3000)

    if (!resolvedRouteLink) {
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
    targetPath = '/'
  }

  redirect(targetPath)
}
