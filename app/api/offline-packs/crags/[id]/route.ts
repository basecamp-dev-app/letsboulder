import { createHash } from 'node:crypto'
import pLimit from 'p-limit'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { buildClimbOfflinePack } from '@/lib/offline/build-climb-pack'
import type { CragOfflinePackManifest } from '@/lib/climb/queries'

interface ClimbRow {
  id: string
  name: string
  slug: string | null
  status: string | null
}

function getAdminClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL

  if (!serviceRoleKey || !supabaseUrl) {
    throw new Error('Supabase service role is not configured')
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
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
    const supabase = getAdminClient()
    const [{ data: crag, error: cragError }, { data: climbs, error: climbsError }] = await Promise.all([
      supabase.from('crags').select('id, name, slug, country_code').eq('id', cragId).maybeSingle(),
      supabase
        .from('climbs')
        .select('id, name, slug, status')
        .eq('crag_id', cragId)
        .in('status', ['active', 'approved'])
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
    const climbSummaries = await Promise.all(
      climbRows.map((climb) => limit(async () => {
        const pack = await buildClimbOfflinePack(climb.id)
        return {
          climbId: climb.id,
          climbName: climb.name || pack.offline_pack.climbName,
          canonicalPath: pack.offline_pack.canonicalPath || pack.offline_pack.pageUrl,
          manifestUrl: pack.offline_pack.manifestUrl,
          versionHash: pack.offline_pack.version,
          estimatedBytes: pack.offline_pack.estimatedBytes,
          mediaCount: pack.offline_pack.mediaCount,
        }
      }))
    )

    const estimatedBytes = climbSummaries.reduce((sum, climb) => sum + climb.estimatedBytes, 0)
    const mediaCount = climbSummaries.reduce((sum, climb) => sum + climb.mediaCount, 0)
    const cragVersionHash = hashParts({
      crag: { id: crag.id, name: crag.name, canonicalPath },
      climbs: climbSummaries.map((climb) => ({ climbId: climb.climbId, versionHash: climb.versionHash })),
    })

    const payload: CragOfflinePackManifest = {
      packId: `crag:${crag.id}`,
      type: 'crag',
      cragId: crag.id,
      cragName: crag.name,
      canonicalPath,
      manifestUrl: `/api/offline-packs/crags/${crag.id}`,
      cragVersionHash,
      estimatedBytes,
      climbCount: climbSummaries.length,
      mediaCount,
      climbs: climbSummaries,
      removedClimbIds: [],
    }

    return NextResponse.json(payload)
  } catch (error) {
    console.error('Offline crag pack route error:', error)
    return NextResponse.json({ error: 'Failed to load crag pack' }, { status: 500 })
  }
}
