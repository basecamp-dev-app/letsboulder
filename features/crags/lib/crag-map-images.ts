import type { SupabaseClient } from '@supabase/supabase-js'
import { isMediaPubliclyDeliverable } from '@/lib/media/readiness'
import { resolveRouteImageUrl } from '@/lib/media/route-image-url'
import type { ImageData } from '@/features/crags/lib/crag-page-types'
import type { Database } from '@/types/database'

type ImageTableRow = Database['public']['Tables']['images']['Row']
type CragImageTableRow = Database['public']['Tables']['crag_images']['Row']

export type CragMapImageRow = Pick<ImageTableRow,
  | 'id'
  | 'url'
  | 'latitude'
  | 'longitude'
  | 'created_at'
  | 'is_verified'
  | 'verification_count'
  | 'is_primary'
  | 'parent_image_id'
  | 'submission_id'
  | 'processing_status'
  | 'moderation_status'
  | 'visibility'
  | 'status'
> & {
  route_lines: Array<{ count: number }> | null
}

export type CragMapImageLinkRow = Pick<CragImageTableRow, 'linked_image_id' | 'source_image_id'>

const IMAGE_PAGE_SIZE = 500
const IMAGE_ID_BATCH_SIZE = 200
const INITIAL_IMAGE_LIMIT = 48
const IMAGE_SELECT = 'id, url, latitude, longitude, created_at, is_verified, verification_count, is_primary, parent_image_id, submission_id, processing_status, moderation_status, visibility, status, route_lines(count)'

class ImageFamilies {
  private readonly parentById = new Map<string, string>()

  add(id: string) {
    if (!this.parentById.has(id)) this.parentById.set(id, id)
  }

  find(id: string): string {
    const parent = this.parentById.get(id)
    if (!parent) {
      this.parentById.set(id, id)
      return id
    }
    if (parent === id) return id

    const root = this.find(parent)
    this.parentById.set(id, root)
    return root
  }

  union(firstId: string, secondId: string) {
    const firstRoot = this.find(firstId)
    const secondRoot = this.find(secondId)
    if (firstRoot === secondRoot) return

    const root = firstRoot.localeCompare(secondRoot) <= 0 ? firstRoot : secondRoot
    this.parentById.set(root === firstRoot ? secondRoot : firstRoot, root)
  }
}

function isValidCoordinates(row: Pick<CragMapImageRow, 'latitude' | 'longitude'>): row is CragMapImageRow & { latitude: number; longitude: number } {
  return typeof row.latitude === 'number'
    && Number.isFinite(row.latitude)
    && row.latitude >= -90
    && row.latitude <= 90
    && typeof row.longitude === 'number'
    && Number.isFinite(row.longitude)
    && row.longitude >= -180
    && row.longitude <= 180
}

function compareImageRows(first: CragMapImageRow, second: CragMapImageRow, canonicalImageIds: Set<string>) {
  const firstCanonicalRank = canonicalImageIds.has(first.id) ? 0 : 1
  const secondCanonicalRank = canonicalImageIds.has(second.id) ? 0 : 1
  if (firstCanonicalRank !== secondCanonicalRank) return firstCanonicalRank - secondCanonicalRank
  if (first.is_primary !== second.is_primary) return first.is_primary ? -1 : 1
  if (first.parent_image_id !== second.parent_image_id) return first.parent_image_id ? 1 : -1

  const createdAtDelta = new Date(first.created_at || 0).getTime() - new Date(second.created_at || 0).getTime()
  if (Number.isFinite(createdAtDelta) && createdAtDelta !== 0) return createdAtDelta
  return first.id.localeCompare(second.id)
}

export function buildCragMapImages(rows: CragMapImageRow[], links: CragMapImageLinkRow[]): ImageData[] {
  const deliverableRows = Array.from(new Map(
    rows.filter(isMediaPubliclyDeliverable).map((row) => [row.id, row])
  ).values())
  const rowById = new Map(deliverableRows.map((row) => [row.id, row]))
  const families = new ImageFamilies()
  const firstImageIdBySubmissionId = new Map<string, string>()
  const canonicalImageIds = new Set<string>()

  for (const row of deliverableRows) {
    families.add(row.id)
    if (row.parent_image_id && rowById.has(row.parent_image_id)) {
      families.union(row.id, row.parent_image_id)
      canonicalImageIds.add(row.parent_image_id)
    }
    if (!row.submission_id) continue

    const firstImageId = firstImageIdBySubmissionId.get(row.submission_id)
    if (firstImageId) families.union(row.id, firstImageId)
    else firstImageIdBySubmissionId.set(row.submission_id, row.id)
  }

  for (const link of links) {
    if (!link.source_image_id || !link.linked_image_id || link.source_image_id === link.linked_image_id) continue
    if (!rowById.has(link.source_image_id) || !rowById.has(link.linked_image_id)) continue
    families.union(link.source_image_id, link.linked_image_id)
    canonicalImageIds.add(link.source_image_id)
  }

  const locatedRowsByFamily = new Map<string, CragMapImageRow[]>()
  for (const row of deliverableRows) {
    if (!isValidCoordinates(row)) continue
    const familyId = families.find(row.id)
    const familyRows = locatedRowsByFamily.get(familyId)
    if (familyRows) familyRows.push(row)
    else locatedRowsByFamily.set(familyId, [row])
  }

  const primaryImageIdByImageId = new Map<string, string>()
  for (const familyRows of locatedRowsByFamily.values()) {
    familyRows.sort((first, second) => compareImageRows(first, second, canonicalImageIds))
    const primaryImageId = familyRows[0]?.id
    if (!primaryImageId) continue
    for (const row of familyRows) primaryImageIdByImageId.set(row.id, primaryImageId)
  }

  return deliverableRows
    .filter(isValidCoordinates)
    .sort((first, second) => {
      const createdAtDelta = new Date(second.created_at || 0).getTime() - new Date(first.created_at || 0).getTime()
      if (Number.isFinite(createdAtDelta) && createdAtDelta !== 0) return createdAtDelta
      return first.id.localeCompare(second.id)
    })
    .map((row) => {
      const familySize = locatedRowsByFamily.get(families.find(row.id))?.length || 1
      return {
        id: row.id,
        url: resolveRouteImageUrl(row.url),
        storageUrl: row.url,
        latitude: row.latitude,
        longitude: row.longitude,
        created_at: row.created_at,
        route_lines_count: row.route_lines?.[0]?.count || 0,
        is_verified: row.is_verified || false,
        verification_count: row.verification_count || 0,
        supplementary_faces_count: familySize - 1,
        map_primary_image_id: primaryImageIdByImageId.get(row.id) || row.id,
      }
    })
}

export async function loadPublicCragMapImages(
  supabase: SupabaseClient<Database>,
  cragId: string,
  options?: { initialOnly?: boolean }
): Promise<ImageData[]> {
  const directRows: CragMapImageRow[] = []
  const links: CragMapImageLinkRow[] = []

  for (let from = 0; ; from += IMAGE_PAGE_SIZE) {
    const pageSize = options?.initialOnly ? Math.min(INITIAL_IMAGE_LIMIT - directRows.length, IMAGE_PAGE_SIZE) : IMAGE_PAGE_SIZE
    if (pageSize <= 0) break
    const { data, error } = await supabase
      .from('images')
      .select(IMAGE_SELECT)
      .eq('crag_id', cragId)
      .eq('status', 'approved')
      .eq('processing_status', 'ready')
      .in('moderation_status', ['approved', 'skipped'])
      .eq('visibility', 'public')
      .order('created_at', { ascending: false })
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1)

    if (error) throw error
    const page = (data || []) as CragMapImageRow[]
    directRows.push(...page)
    if (page.length < pageSize || options?.initialOnly) break
  }

  if (options?.initialOnly) return buildCragMapImages(directRows, links)

  for (let from = 0; ; from += IMAGE_PAGE_SIZE) {
    const { data, error } = await supabase
      .from('crag_images')
      .select('linked_image_id, source_image_id')
      .eq('crag_id', cragId)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + IMAGE_PAGE_SIZE - 1)

    if (error) throw error
    const page = (data || []) as CragMapImageLinkRow[]
    links.push(...page)
    if (page.length < IMAGE_PAGE_SIZE) break
  }

  const knownImageIds = new Set(directRows.map((row) => row.id))
  const associatedImageIds = Array.from(new Set(links.flatMap((link) => [link.source_image_id, link.linked_image_id])))
    .filter((imageId): imageId is string => typeof imageId === 'string' && !knownImageIds.has(imageId))
  const associatedRows: CragMapImageRow[] = []

  for (let index = 0; index < associatedImageIds.length; index += IMAGE_ID_BATCH_SIZE) {
    const imageIds = associatedImageIds.slice(index, index + IMAGE_ID_BATCH_SIZE)
    const { data, error } = await supabase
      .from('images')
      .select(IMAGE_SELECT)
      .in('id', imageIds)
      .eq('status', 'approved')
      .eq('processing_status', 'ready')
      .in('moderation_status', ['approved', 'skipped'])
      .eq('visibility', 'public')
      .order('created_at', { ascending: false })
      .order('id', { ascending: true })

    if (error) throw error
    associatedRows.push(...((data || []) as CragMapImageRow[]))
  }

  return buildCragMapImages([...directRows, ...associatedRows], links)
}
