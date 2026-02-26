import { createServerClient } from '@supabase/ssr'
import { redirect } from 'next/navigation'

interface RouteLink {
  id: string
  climb_id: string
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

  let routeLink: RouteLink | null = null
  let targetPath: string | null = null

  try {
    const requestedRouteId = query.route
    const requestedTab = query.tab

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

    if (!routeLink?.climb_id) {
      targetPath = '/'
    } else {
      const next = new URLSearchParams()
      next.set('route', routeLink.id)
      if (requestedTab === 'tops' || requestedTab === 'climb') {
        next.set('tab', requestedTab)
      }
      targetPath = `/climb/${routeLink.climb_id}?${next.toString()}`
    }
  } catch (error) {
    console.error('Failed to redirect image page:', error)
    targetPath = '/'
  }

  redirect(targetPath)
}
