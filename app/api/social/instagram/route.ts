import { NextRequest } from 'next/server'
import { resolveUserIdWithFallback } from '@/lib/auth-context'
import { getServerClientFromRequest } from '@/lib/supabase-server'
import { requireAdminFromSupabase } from '@/features/admin/server'
import { loadInstagramPostData } from '@/features/social/server/load-instagram-post-data'
import { renderInstagramPost } from '@/features/social/server/instagram-template'

type ExportMode = 'image' | 'selected-route' | 'all-routes'

export async function GET(request: NextRequest) {
  const supabase = getServerClientFromRequest(request)
  const { userId } = await resolveUserIdWithFallback(request, supabase)

  if (!userId) {
    return Response.json({ error: 'Authentication required' }, { status: 401 })
  }

  const adminError = await requireAdminFromSupabase(supabase, userId)
  if (adminError) return adminError

  const searchParams = request.nextUrl.searchParams
  const country = searchParams.get('country')
  const crag = searchParams.get('crag')
  const imageId = searchParams.get('image')
  const routeIdentifier = searchParams.get('route')
  const mode = (searchParams.get('mode') || 'image') as ExportMode

  if (!country || !crag || !imageId) {
    return Response.json({ error: 'Missing required query params' }, { status: 400 })
  }

  if (!['image', 'selected-route', 'all-routes'].includes(mode)) {
    return Response.json({ error: 'Invalid export mode' }, { status: 400 })
  }

  if (mode === 'selected-route' && !routeIdentifier) {
    return Response.json({ error: 'Route is required for selected-route mode' }, { status: 400 })
  }

  const postData = await loadInstagramPostData({
    country,
    crag,
    imageId,
    routeIdentifier,
  })

  if (!postData) {
    return Response.json({ error: 'Instagram post data not found' }, { status: 404 })
  }

  const imageResponse = await fetch(postData.imageUrl)
  if (!imageResponse.ok) {
    return Response.json({ error: 'Failed to fetch source image' }, { status: 502 })
  }

  const imageBuffer = Buffer.from(await imageResponse.arrayBuffer())
  const output = await renderInstagramPost({
    imageBuffer,
    naturalWidth: postData.naturalWidth,
    naturalHeight: postData.naturalHeight,
    routes: mode === 'image'
      ? []
      : mode === 'selected-route'
        ? postData.routes.filter((route) => route.isSelected)
        : postData.routes,
  })

  const filename = `${crag}-instagram-post.png`
  return new Response(new Uint8Array(output), {
    headers: {
      'Content-Type': 'image/png',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'public, max-age=300',
    },
  })
}
