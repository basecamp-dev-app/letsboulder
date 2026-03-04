import type { Submission } from '@/types/submissions'

interface SubmissionImageRow {
  id: string
  url: string
  created_at: string
  contribution_credit_platform: string | null
  contribution_credit_handle: string | null
  crags: { name?: string } | Array<{ name?: string }> | null
  route_lines: Array<{ count?: number }> | null
}

interface CragImageLinkRow {
  source_image_id: string | null
  linked_image_id: string | null
}

interface SubmissionGroupAggregate {
  id: string
  canonical_image_id: string
  canonical_url: string
  created_at: string
  updated_at: string
  crag_name: string | null
  route_lines_count: number
  contribution_credit_platform: string | null
  contribution_credit_handle: string | null
  image_ids: string[]
}

function pickCragName(value: SubmissionImageRow['crags']): string | null {
  if (!value) return null
  if (Array.isArray(value)) return value[0]?.name || null
  return value.name || null
}

function pickRouteLinesCount(value: SubmissionImageRow['route_lines']): number {
  if (!Array.isArray(value) || !value[0]) return 0
  return value[0].count || 0
}

function resolveGroupKey(
  imageId: string,
  linkedImageToSourceMap: Map<string, string>,
  sourceImageIds: Set<string>
): string {
  const sourceImageId = linkedImageToSourceMap.get(imageId)
  if (sourceImageId) return sourceImageId
  if (sourceImageIds.has(imageId)) return imageId
  return imageId
}

export function groupSubmittedImages(
  rows: SubmissionImageRow[],
  links: CragImageLinkRow[]
): Submission[] {
  if (rows.length === 0) return []

  const rowByImageId = new Map(rows.map((row) => [row.id, row]))
  const linkedImageToSourceMap = new Map<string, string>()
  const sourceImageIds = new Set<string>()

  for (const link of links) {
    if (typeof link.source_image_id === 'string' && link.source_image_id) {
      sourceImageIds.add(link.source_image_id)
    }
    if (
      typeof link.linked_image_id === 'string' &&
      link.linked_image_id &&
      typeof link.source_image_id === 'string' &&
      link.source_image_id
    ) {
      linkedImageToSourceMap.set(link.linked_image_id, link.source_image_id)
    }
  }

  const grouped = new Map<string, SubmissionGroupAggregate>()

  for (const row of rows) {
    const groupKey = resolveGroupKey(row.id, linkedImageToSourceMap, sourceImageIds)
    const existing = grouped.get(groupKey)
    const routeLinesCount = pickRouteLinesCount(row.route_lines)
    const cragName = pickCragName(row.crags)

    if (!existing) {
      const canonical = rowByImageId.get(groupKey) || row
      grouped.set(groupKey, {
        id: groupKey,
        canonical_image_id: canonical.id,
        canonical_url: canonical.url,
        created_at: row.created_at,
        updated_at: row.created_at,
        crag_name: cragName,
        route_lines_count: routeLinesCount,
        contribution_credit_platform: row.contribution_credit_platform || null,
        contribution_credit_handle: row.contribution_credit_handle || null,
        image_ids: [row.id],
      })
      continue
    }

    if (new Date(row.created_at).getTime() > new Date(existing.updated_at).getTime()) {
      existing.updated_at = row.created_at
    }

    existing.route_lines_count += routeLinesCount
    if (!existing.crag_name && cragName) {
      existing.crag_name = cragName
    }
    if (!existing.contribution_credit_handle && row.contribution_credit_handle) {
      existing.contribution_credit_handle = row.contribution_credit_handle
      existing.contribution_credit_platform = row.contribution_credit_platform || null
    }
    if (!existing.image_ids.includes(row.id)) {
      existing.image_ids.push(row.id)
    }
  }

  return [...grouped.values()]
    .map((group) => ({
      id: group.id,
      kind: 'submitted' as const,
      url: group.canonical_url,
      created_at: group.created_at,
      updated_at: group.updated_at,
      crag_name: group.crag_name,
      route_lines_count: group.route_lines_count,
      contribution_credit_platform: group.contribution_credit_platform,
      contribution_credit_handle: group.contribution_credit_handle,
      image_ids: group.image_ids,
      image_count: group.image_ids.length,
    }))
    .filter((submission) => submission.route_lines_count > 0)
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
}
