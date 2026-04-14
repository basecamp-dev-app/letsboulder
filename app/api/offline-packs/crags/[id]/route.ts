import { createHash } from 'node:crypto'
import pLimit from 'p-limit'
import { NextRequest, NextResponse } from 'next/server'
import { buildClimbOfflinePack } from '@/lib/offline/build-climb-pack'
import type { CragOfflinePackManifest, OfflineMapPin } from '@/features/climb/lib/queries'
import { estimateCompressedImageBytes } from '@/lib/media-proxy'
import { reportError } from '@/lib/errors'
import { PUBLIC_OFFLINE_CLIMB_STATUSES, getOfflinePackClient } from '@/lib/offline/build-climb-pack-helpers'

export const revalidate = 3600

interface ClimbRow {
  id: string
  name: string
  slug: string | null
  status: string | null
}

interface FailedClimbSummary {
  climbId: string
  error: string
}

function hashParts(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 16)
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: cragId } = await params

  if (!cragId) {
    return NextResponse.json({ error: 'Crag ID is required' }, { status: 400 })
  }

  try {
    const supabase = getOfflinePackClient()
    const [{ data: crag, error: cragError }, { data: climbs, error: climbsError }] = await Promise.all([
      supabase.from('crags').select('id, name, slug, country_code').eq('id', cragId).maybeSingle(),
      supabase
        .from('climbs')
        .select('id, name, slug, status')
        .eq('crag_id', cragId)
        .is('deleted_at', null)
        .in('status', [...PUBLIC_OFFLINE_CLIMB_STATUSES])
        .order('name', { ascending: true }),
    ])

    if (cragError) throw cragError
    if (climbsError) throw climbsError
    if (!crag) {
      return NextResponse.json({ error: 'Crag not found' }, { status: 404 })
    }

    const canonicalPath = crag.country_code && crag.slug
      ? `/${crag.country_code.toLowerCase()}/${crag.slug}`
      : `/crag/${crag.id}`

    const limit = pLimit(3)
    const climbRows = (climbs || []) as ClimbRow[]
    const failedClimbIds: FailedClimbSummary[] = []
    const settledClimbs = await Promise.all(
      climbRows.map((climb) => limit(async () => {
        try {
          const pack = await buildClimbOfflinePack(climb.id)
          return {
            climbId: climb.id,
            climbName: climb.name || pack.offline_pack.climbName,
            canonicalPath: pack.offline_pack.canonicalPath || pack.offline_pack.pageUrl,
            manifestUrl: pack.offline_pack.manifestUrl,
            versionHash: pack.offline_pack.version,
            estimatedBytes: pack.offline_pack.estimatedBytes,
            mediaCount: pack.offline_pack.mediaCount,
            coverImageUrl: pack.offline_pack.coverImageUrl || null,
            primaryPin: pack.offline_pack.primaryPin || null,
            mediaUrls: pack.offline_pack.mediaUrls,
            primaryImage: pack.primary_image,
            faces: pack.faces,
          }
        } catch (error) {
          reportError(error, {
            message: 'Failed to build climb summary for crag offline pack',
            extra: { cragId, climbId: climb.id },
          })
          failedClimbIds.push({
            climbId: climb.id,
            error: error instanceof Error ? error.message : 'Unknown climb-pack error',
          })
          return null
        }
      }))
    )

    const climbSummaries = settledClimbs.filter((value): value is NonNullable<typeof value> => !!value)

    if (climbSummaries.length === 0 && climbRows.length > 0) {
      return NextResponse.json({ error: 'Failed to load any climbs for this crag pack' }, { status: 500 })
    }

    const imageByteEstimates = new Map<string, number>()
    for (const climb of climbSummaries) {
      if (climb.primaryImage?.url && !imageByteEstimates.has(climb.primaryImage.url)) {
        const w = climb.primaryImage.natural_width ?? climb.primaryImage.width ?? null
        const h = climb.primaryImage.natural_height ?? climb.primaryImage.height ?? null
        imageByteEstimates.set(climb.primaryImage.url, estimateCompressedImageBytes(w, h))
      }
      for (const face of climb.faces) {
        if (!face.url || imageByteEstimates.has(face.url)) continue
        const w = face.metadata?.width ?? null
        const h = face.metadata?.height ?? null
        imageByteEstimates.set(face.url, estimateCompressedImageBytes(w, h))
      }
    }

    const estimatedBytes = Array.from(imageByteEstimates.values()).reduce((sum, b) => sum + b, 0)
    const mediaCount = imageByteEstimates.size
    const savedPins = climbSummaries
      .map((climb) => climb.primaryPin)
      .filter((pin): pin is OfflineMapPin => pin !== null)
    const cragVersionHash = hashParts({
      crag: { id: crag.id, name: crag.name, canonicalPath },
      climbs: climbSummaries.map((climb) => ({ climbId: climb.climbId, versionHash: climb.versionHash })),
      savedPins,
    })

    const payload: CragOfflinePackManifest = {
      packId: `crag:${crag.id}`,
      type: 'crag',
      cragId: crag.id,
      cragName: crag.name,
      canonicalPath,
      offlineLaunchUrl: climbSummaries[0]?.primaryPin?.canonicalPath || canonicalPath,
      manifestUrl: `/api/offline-packs/crags/${crag.id}`,
      cragVersionHash,
      estimatedBytes,
      climbCount: climbSummaries.length,
      mediaCount,
      climbs: climbSummaries.map((climb) => ({
        climbId: climb.climbId,
        climbName: climb.climbName,
        canonicalPath: climb.canonicalPath,
        manifestUrl: climb.manifestUrl,
        versionHash: climb.versionHash,
        estimatedBytes: climb.estimatedBytes,
        mediaCount: climb.mediaCount,
        coverImageUrl: climb.coverImageUrl,
        primaryPin: climb.primaryPin,
      })),
      savedPins,
      removedClimbIds: [],
      failedClimbIds: failedClimbIds.map((item) => item.climbId),
      warning: failedClimbIds.length > 0
        ? `${failedClimbIds.length} climb${failedClimbIds.length === 1 ? '' : 's'} could not be prepared and will be skipped.`
        : null,
    }

    return NextResponse.json(payload)
  } catch (error) {
    reportError(error, { message: 'Offline crag pack route error' })
    return NextResponse.json({ error: 'Failed to load crag pack' }, { status: 500 })
  }
}
