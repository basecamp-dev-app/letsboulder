import { NextResponse } from 'next/server'
import { createErrorResponse, reportError } from '@/lib/errors'
import { getSignedUrlBatchKey } from '@/lib/signed-url-batch'
import { createSignedObjectUrls } from '@/lib/media/object-urls'
import { getAdminClientWithAudit } from '@/lib/supabase-admin'
import { getServerClientFromRequest } from '@/lib/supabase-server'

type RequestSupabaseClient = ReturnType<typeof getServerClientFromRequest>

interface CragImageRow {
  id: string
  url: string
  width: number | null
  height: number | null
  linked_image_id: string | null
  created_at: string
  linked_image: {
    processing_status: string
    moderation_status: string | null
    visibility: string
    status: string
  } | Array<{
    processing_status: string
    moderation_status: string | null
    visibility: string
    status: string
  }> | null
}

interface RouteTargetRow {
  id: string
  image_id: string
  climb_id: string
  climbs:
    | { slug: string | null }
    | Array<{ slug: string | null }>
    | null
}

function parsePrivateStorageUrl(url: string): { bucket: string; path: string } | null {
  if (!url.startsWith('private://')) return null
  const withoutScheme = url.slice('private://'.length)
  const slashIndex = withoutScheme.indexOf('/')
  if (slashIndex <= 0) return null

  const bucket = withoutScheme.slice(0, slashIndex)
  const path = withoutScheme.slice(slashIndex + 1)
  if (!bucket || !path) return null
  return { bucket, path }
}

export async function loadCragImages(supabase: RequestSupabaseClient, cragId: string) {
  const supabaseAdmin = getAdminClientWithAudit('load crag images for signing')

  try {
    const { data: existingCrag, error: cragError } = await supabase
      .from('crags')
      .select('id')
      .eq('id', cragId)
      .maybeSingle()

    if (cragError) {
      return createErrorResponse(cragError, 'Failed to validate crag')
    }

    if (!existingCrag) {
      return NextResponse.json({ error: 'Crag not found' }, { status: 404 })
    }

    const [{ data, error }, { data: cragData }, { data: routeTargetData, error: routeTargetError }] = await Promise.all([
      supabase
        .from('crag_images')
        .select('id, url, width, height, linked_image_id, created_at, linked_image:linked_image_id(processing_status, moderation_status, visibility, status)')
        .eq('crag_id', cragId)
        .order('created_at', { ascending: false })
        .limit(50),
      supabase
        .from('crags')
        .select('country_code, slug')
        .eq('id', cragId)
        .maybeSingle(),
      supabase
        .from('route_lines')
        .select('id, image_id, climb_id, climbs!inner(slug, crag_id)')
        .eq('climbs.crag_id', cragId)
        .order('image_id', { ascending: true })
        .order('sequence_order', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: true }),
    ])

    if (error) {
      return createErrorResponse(error, 'Failed to load crag images')
    }

    if (routeTargetError) {
      return createErrorResponse(routeTargetError, 'Failed to load route image targets')
    }

    const rows = ((data || []) as CragImageRow[]).filter((row) => {
      if (!row.linked_image_id) return true
      const linkedImage = Array.isArray(row.linked_image) ? row.linked_image[0] : row.linked_image
      return linkedImage?.processing_status === 'ready'
        && (linkedImage.moderation_status === 'approved' || linkedImage.moderation_status === 'skipped')
        && linkedImage.visibility === 'public'
        && linkedImage.status === 'approved'
    })
    const pathsByBucket = new Map<string, Set<string>>()

    for (const row of rows) {
      const parsed = parsePrivateStorageUrl(row.url)
      if (!parsed) continue

      const current = pathsByBucket.get(parsed.bucket) || new Set<string>()
      current.add(parsed.path)
      pathsByBucket.set(parsed.bucket, current)
    }

    const signedByKey = new Map<string, string>()

    for (const [bucket, pathSet] of pathsByBucket.entries()) {
      const paths = Array.from(pathSet)
      if (paths.length === 0) continue

      try {
        const signed = await createSignedObjectUrls(paths.map((path) => ({ bucket, path })), supabaseAdmin)
        for (const path of paths) {
          const signedUrl = signed.get(`${bucket}:${path}`)
          if (!signedUrl) continue
          signedByKey.set(getSignedUrlBatchKey(bucket, path), signedUrl)
        }
      } catch (signedError) {
        reportError(signedError, {
          message: 'Crag images batch signed URL generation failed',
          level: 'warning',
          extra: {
            cragId,
            bucket,
            pathCount: paths.length,
          },
        })
      }
    }

    const result: Array<CragImageRow & { signed_url: string | null }> = rows.map((row) => {
      const parsed = parsePrivateStorageUrl(row.url)
      if (!parsed) {
        return { ...row, signed_url: row.url }
      }

      return {
        ...row,
        signed_url: signedByKey.get(getSignedUrlBatchKey(parsed.bucket, parsed.path)) || null,
      }
    })

    const routeTargetByImageId = new Map<string, { climbId: string; routeId: string; climbSlug: string | null; imageId: string }>()
    for (const row of (routeTargetData || []) as RouteTargetRow[]) {
      if (routeTargetByImageId.has(row.image_id)) continue
      const climb = Array.isArray(row.climbs) ? row.climbs[0] : row.climbs
      routeTargetByImageId.set(row.image_id, {
        climbId: row.climb_id,
        routeId: row.id,
        climbSlug: climb?.slug || null,
        imageId: row.image_id,
      })
    }

    return NextResponse.json({
      crag: {
        country_code: cragData?.country_code || null,
        slug: cragData?.slug || null,
      },
      images: result.map((row) => ({
        ...row,
        linked_image: undefined,
        display_image_id: row.linked_image_id || row.id,
        routeTarget: routeTargetByImageId.get(row.linked_image_id || row.id) || null,
      })),
    })
  } catch (error) {
    return createErrorResponse(error, 'Failed to fetch crag images')
  }
}
