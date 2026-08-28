import 'server-only'

import { createSignedObjectUrls, parsePrivateStorageUrl } from '@/lib/media/object-urls'
import { isCurrentUserAdmin } from '@/lib/profile-rpc'
import { getAdminClientWithAudit } from '@/lib/supabase-admin'
import { getServerClient } from '@/lib/supabase-server'
import type { Database } from '@/types/database'
import type {
  ManagedCragImage,
  ManagedCragImagesPage,
} from '@/features/crag-management/types/managed-crag-image'
import {
  buildImageRouteAssociationIds,
  type CragImageAssociationLink,
} from '@/features/crag-management/lib/image-route-associations'

type ImageRow = Pick<Database['public']['Tables']['images']['Row'],
  'id' | 'url' | 'optimized_bucket' | 'optimized_key' | 'storage_bucket' | 'storage_path'
  | 'original_bucket' | 'original_key' | 'status' | 'visibility' | 'processing_status'
  | 'moderation_status' | 'created_at'>

type LegacyImageRow = Pick<Database['public']['Tables']['crag_images']['Row'],
  'id' | 'url' | 'created_at'>

type RouteLineRow = Pick<Database['public']['Tables']['route_lines']['Row'],
  'image_id' | 'climb_id'>

type ClimbRow = Pick<Database['public']['Tables']['climbs']['Row'],
  'id' | 'name' | 'deleted_at'>

export const MANAGED_CRAG_IMAGES_PAGE_SIZE = 24
const ASSOCIATION_PAGE_SIZE = 500
const QUERY_BATCH_SIZE = 200

export type ManagedCragImagesLoadResult =
  | { success: true; data: ManagedCragImagesPage }
  | { success: false; status: 401 | 403 | 404 | 500; error: string }

function getImageStorageRef(image: ImageRow) {
  if (image.optimized_bucket && image.optimized_key) {
    return { bucket: image.optimized_bucket, path: image.optimized_key }
  }
  if (image.storage_bucket && image.storage_path) {
    return { bucket: image.storage_bucket, path: image.storage_path }
  }
  if (image.original_bucket && image.original_key) {
    return { bucket: image.original_bucket, path: image.original_key }
  }
  return parsePrivateStorageUrl(image.url)
}

function isPubliclyDeliverable(image: Pick<ImageRow,
  'status' | 'visibility' | 'processing_status' | 'moderation_status'>) {
  return image.status === 'approved'
    && image.visibility === 'public'
    && image.processing_status === 'ready'
    && (image.moderation_status === 'approved' || image.moderation_status === 'skipped')
}

export async function loadManagedCragImages(
  cragId: string,
  requestedPage: number,
): Promise<ManagedCragImagesLoadResult> {
  const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1
  const supabase = await getServerClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return { success: false, status: 401, error: 'Authentication required' }

  const [{ data: isAdmin }, { data: assignment, error: assignmentError }] = await Promise.all([
    isCurrentUserAdmin(supabase),
    supabase
      .from('crag_maintainers')
      .select('crag_id')
      .eq('crag_id', cragId)
      .eq('user_id', user.id)
      .maybeSingle(),
  ])
  if (assignmentError) return { success: false, status: 500, error: 'Failed to verify crag access' }
  if (isAdmin !== true && !assignment) {
    return { success: false, status: 403, error: 'You are not assigned to manage this crag' }
  }

  const admin = getAdminClientWithAudit(`load managed crag images for ${cragId}`)
  const [{ data: crag, error: cragError }, canonicalCountResult, legacyCountResult, routeCountResult] = await Promise.all([
    admin
      .from('crags')
      .select('id, name, country_code, slug, region_name, sub_area, publication_status, publication_notes')
      .eq('id', cragId)
      .is('deleted_at', null)
      .maybeSingle(),
    admin.from('images').select('id', { count: 'exact', head: true }).eq('crag_id', cragId),
    admin.from('crag_images').select('id', { count: 'exact', head: true }).eq('crag_id', cragId).is('linked_image_id', null),
    admin.from('climbs').select('id', { count: 'exact', head: true }).eq('crag_id', cragId).is('deleted_at', null),
  ])
  if (cragError) return { success: false, status: 500, error: 'Failed to load crag' }
  if (!crag) return { success: false, status: 404, error: 'Crag not found' }
  if (canonicalCountResult.error || legacyCountResult.error || routeCountResult.error) {
    return { success: false, status: 500, error: 'Failed to load crag counts' }
  }

  const total = (canonicalCountResult.count || 0) + (legacyCountResult.count || 0)
  const totalPages = Math.max(1, Math.ceil(total / MANAGED_CRAG_IMAGES_PAGE_SIZE))
  const boundedPage = Math.min(page, totalPages)
  const rowsNeeded = boundedPage * MANAGED_CRAG_IMAGES_PAGE_SIZE
  const [{ data: canonicalRows, error: canonicalError }, { data: legacyRows, error: legacyError }] = await Promise.all([
    admin
      .from('images')
      .select('id, url, optimized_bucket, optimized_key, storage_bucket, storage_path, original_bucket, original_key, status, visibility, processing_status, moderation_status, created_at')
      .eq('crag_id', cragId)
      .order('created_at', { ascending: false, nullsFirst: false })
      .order('id', { ascending: true })
      .range(0, Math.max(0, rowsNeeded - 1)),
    admin
      .from('crag_images')
      .select('id, url, created_at')
      .eq('crag_id', cragId)
      .is('linked_image_id', null)
      .order('created_at', { ascending: false })
      .order('id', { ascending: true })
      .range(0, Math.max(0, rowsNeeded - 1)),
  ])
  if (canonicalError || legacyError) {
    return { success: false, status: 500, error: 'Failed to load managed images' }
  }

  const candidates = [
    ...((canonicalRows || []) as ImageRow[]).map((row) => ({ kind: 'canonical' as const, row })),
    ...((legacyRows || []) as LegacyImageRow[]).map((row) => ({ kind: 'legacy' as const, row })),
  ].sort((a, b) => {
    const created = (b.row.created_at || '').localeCompare(a.row.created_at || '')
    return created !== 0 ? created : a.row.id.localeCompare(b.row.id)
  })
  const offset = (boundedPage - 1) * MANAGED_CRAG_IMAGES_PAGE_SIZE
  const pageRows = candidates.slice(offset, offset + MANAGED_CRAG_IMAGES_PAGE_SIZE)
  const pageCanonical = pageRows
    .filter((candidate): candidate is { kind: 'canonical'; row: ImageRow } => candidate.kind === 'canonical')
    .map((candidate) => candidate.row)
  const pageImageIds = pageCanonical.map((image) => image.id)

  const routeLines: RouteLineRow[] = []
  let climbsById = new Map<string, ClimbRow>()
  const activeImagesByClimb = new Map<string, Set<string>>()
  let associationIdsByImage = new Map(pageImageIds.map((imageId) => [imageId, new Set([imageId])]))
  if (pageImageIds.length > 0) {
    const associationLinks: CragImageAssociationLink[] = []
    for (let from = 0; ; from += ASSOCIATION_PAGE_SIZE) {
      const { data, error } = await admin
        .from('crag_images')
        .select('source_image_id, linked_image_id')
        .eq('crag_id', cragId)
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .range(from, from + ASSOCIATION_PAGE_SIZE - 1)
      if (error) return { success: false, status: 500, error: 'Failed to load image associations' }
      const rows = (data || []) as CragImageAssociationLink[]
      associationLinks.push(...rows)
      if (rows.length < ASSOCIATION_PAGE_SIZE) break
    }
    associationIdsByImage = buildImageRouteAssociationIds(pageImageIds, associationLinks)
    const associatedImageIds = [...new Set([...associationIdsByImage.values()].flatMap((ids) => [...ids]))]
    for (let index = 0; index < associatedImageIds.length; index += QUERY_BATCH_SIZE) {
      const { data, error } = await admin
        .from('route_lines')
        .select('image_id, climb_id')
        .in('image_id', associatedImageIds.slice(index, index + QUERY_BATCH_SIZE))
      if (error) return { success: false, status: 500, error: 'Failed to load image route impact' }
      routeLines.push(...((data || []) as RouteLineRow[]))
    }
    const climbIds = [...new Set(routeLines.map((line) => line.climb_id))]
    if (climbIds.length > 0) {
      const climbs: ClimbRow[] = []
      const alternativeLines: RouteLineRow[] = []
      for (let index = 0; index < climbIds.length; index += QUERY_BATCH_SIZE) {
        const batch = climbIds.slice(index, index + QUERY_BATCH_SIZE)
        const [{ data: climbRows, error: climbsError }, { data: lineRows, error: alternativeError }] = await Promise.all([
          admin.from('climbs').select('id, name, deleted_at').in('id', batch).eq('crag_id', cragId),
          admin.from('route_lines').select('image_id, climb_id').in('climb_id', batch),
        ])
        if (climbsError || alternativeError) {
          return { success: false, status: 500, error: 'Failed to calculate route impact' }
        }
        climbs.push(...((climbRows || []) as ClimbRow[]))
        alternativeLines.push(...((lineRows || []) as RouteLineRow[]))
      }
      climbsById = new Map(climbs.map((climb) => [climb.id, climb]))
      const alternativeImageIds = [...new Set(alternativeLines.map((line) => line.image_id))]
      if (alternativeImageIds.length > 0) {
        const activeImageIds = new Set<string>()
        for (let index = 0; index < alternativeImageIds.length; index += QUERY_BATCH_SIZE) {
          const { data: alternatives, error: alternativesError } = await admin
            .from('images')
            .select('id, status, visibility, processing_status, moderation_status')
            .in('id', alternativeImageIds.slice(index, index + QUERY_BATCH_SIZE))
          if (alternativesError) return { success: false, status: 500, error: 'Failed to calculate alternative images' }
          for (const alternative of alternatives || []) {
            if (isPubliclyDeliverable(alternative)) activeImageIds.add(alternative.id)
          }
        }
        for (const line of alternativeLines) {
          if (!activeImageIds.has(line.image_id)) continue
          const current = activeImagesByClimb.get(line.climb_id) || new Set<string>()
          current.add(line.image_id)
          activeImagesByClimb.set(line.climb_id, current)
        }
      }
    }
  }

  const refs = pageRows.map((candidate) => {
    if (candidate.kind === 'canonical') return getImageStorageRef(candidate.row)
    return parsePrivateStorageUrl(candidate.row.url)
  }).filter((ref): ref is { bucket: string; path: string } => ref !== null)
  const signed = refs.length > 0 ? await createSignedObjectUrls(refs, admin) : new Map<string, string | null>()

  const images: ManagedCragImage[] = pageRows.map((candidate) => {
    if (candidate.kind === 'legacy') {
      const ref = parsePrivateStorageUrl(candidate.row.url)
      return {
        imageId: null,
        cragImageId: candidate.row.id,
        sourceKind: 'legacy',
        previewUrl: ref ? signed.get(`${ref.bucket}:${ref.path}`) || null : candidate.row.url,
        status: 'legacy',
        visibility: 'unknown',
        processingStatus: 'unknown',
        moderationStatus: null,
        routeCount: 0,
        routesWithoutAlternativeImage: 0,
        routeNames: [],
        createdAt: candidate.row.created_at,
        canRemove: false,
        canReplace: false,
      }
    }

    const image = candidate.row
    const ref = getImageStorageRef(image)
    const associatedImageIds = associationIdsByImage.get(image.id) || new Set([image.id])
    const climbIds = [...new Set(routeLines
      .filter((line) => associatedImageIds.has(line.image_id))
      .map((line) => line.climb_id))]
    const activeClimbs = climbIds.map((id) => climbsById.get(id)).filter((climb): climb is ClimbRow => Boolean(climb && !climb.deleted_at))
    return {
      imageId: image.id,
      cragImageId: null,
      sourceKind: 'canonical',
      previewUrl: ref ? signed.get(`${ref.bucket}:${ref.path}`) || null : image.url,
      status: image.status,
      visibility: image.visibility,
      processingStatus: image.processing_status,
      moderationStatus: image.moderation_status,
      routeCount: activeClimbs.length,
      routesWithoutAlternativeImage: activeClimbs.filter((climb) => {
        const activeImages = activeImagesByClimb.get(climb.id)
        return !activeImages || [...activeImages].every((activeImageId) => activeImageId === image.id)
      }).length,
      routeNames: activeClimbs
        .map((climb) => climb.name)
        .filter((name): name is string => typeof name === 'string' && name.length > 0)
        .slice(0, 3),
      createdAt: image.created_at,
      canRemove: isAdmin === true && image.status !== 'deleted',
      canReplace: image.status !== 'deleted',
    }
  })

  return {
    success: true,
    data: {
      crag: {
        id: crag.id,
        name: crag.name,
        countryCode: crag.country_code,
        slug: crag.slug,
        regionName: crag.region_name,
        subArea: crag.sub_area,
        routeCount: routeCountResult.count || 0,
        imageCount: total,
        publicationStatus: crag.publication_status as 'draft' | 'review' | 'published' | 'archived',
        publicationNotes: crag.publication_notes,
      },
      images,
      page: boundedPage,
      pageSize: MANAGED_CRAG_IMAGES_PAGE_SIZE,
      total,
      totalPages,
      isAdmin: isAdmin === true,
    },
  }
}
