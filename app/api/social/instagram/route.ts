import { NextRequest } from 'next/server'
import { loadInstagramPostData } from '@/features/social/server/load-instagram-post-data'
import { renderInstagramPost } from '@/features/social/server/instagram-template'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const country = searchParams.get('country')
  const crag = searchParams.get('crag')
  const imageId = searchParams.get('image')
  const routeIdentifier = searchParams.get('route')

  if (!country || !crag || !imageId || !routeIdentifier) {
    return Response.json({ error: 'Missing required query params' }, { status: 400 })
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
    routePoints: postData.routePoints,
    routeColor: postData.routeColor,
    locationText: postData.locationText,
    cragName: postData.cragName,
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
