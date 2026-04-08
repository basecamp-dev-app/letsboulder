import type { Submission } from '@/types/submissions'

interface SubmissionImageRow {
  id: string
  url: string
  created_at: string
  submission_id?: string | null
  moderation_status?: string | null
  is_anonymous_submission: boolean | null
  contribution_credit_platform: string | null
  contribution_credit_handle: string | null
  crags: { name?: string } | Array<{ name?: string }> | null
  route_lines: Array<{ count?: number } | { id: string; climb_id: string }> | null
}

interface CragImageLinkRow {
  source_image_id: string | null
  linked_image_id: string | null
}

interface SubmissionGroupAggregate {
  id: string
  canonical_image_id: string
  canonical_url: string
  route_image_id: string | null
  route_line_id: string | null
  climb_id: string | null
  created_at: string
  updated_at: string
  crag_name: string | null
  route_lines_count: number
  is_anonymous_submission: boolean
  contribution_credit_platform: string | null
  contribution_credit_handle: string | null
  image_ids: string[]
  has_published_image: boolean
}

class LinkedImageGroups {
  private parent = new Map<string, string>()

  add(id: string) {
    if (!this.parent.has(id)) this.parent.set(id, id)
  }

  find(id: string): string {
    const existing = this.parent.get(id)
    if (!existing) {
      this.parent.set(id, id)
      return id
    }
    if (existing === id) return id
    const root = this.find(existing)
    this.parent.set(id, root)
    return root
  }

  union(a: string, b: string) {
    const rootA = this.find(a)
    const rootB = this.find(b)
    if (rootA === rootB) return
    const canonicalRoot = rootA.localeCompare(rootB) <= 0 ? rootA : rootB
    const otherRoot = canonicalRoot === rootA ? rootB : rootA
    this.parent.set(otherRoot, canonicalRoot)
  }
}

function toSubmittedStatus(moderationStatus: string | null | undefined): 'pending_review' | 'published' {
  return moderationStatus === 'approved' ? 'published' : 'pending_review'
}

function pickCragName(value: SubmissionImageRow['crags']): string | null {
  if (!value) return null
  if (Array.isArray(value)) return value[0]?.name || null
  return value.name || null
}

function pickRouteLinesCount(value: SubmissionImageRow['route_lines']): number {
  if (!Array.isArray(value)) return 0
  const first = value[0]
  if (first && 'count' in first) return first.count || 0
  return value.length
}

function pickFirstRouteLine(value: SubmissionImageRow['route_lines']): { id: string; climb_id: string } | null {
  if (!Array.isArray(value) || value.length === 0) return null
  const first = value[0]
  if (!first || 'count' in first || !('id' in first) || !('climb_id' in first)) return null
  return first
}

function resolveGroupKey(
  imageId: string,
  submissionId: string | null | undefined,
  linkedGroups: LinkedImageGroups
): string {
  if (typeof submissionId === 'string' && submissionId) return submissionId
  return linkedGroups.find(imageId)
}

export function groupSubmittedImages(
  rows: SubmissionImageRow[],
  links: CragImageLinkRow[]
): Submission[] {
  if (rows.length === 0) return []

  const rowByImageId = new Map(rows.map((row) => [row.id, row]))
  const linkedGroups = new LinkedImageGroups()

  for (const row of rows) {
    linkedGroups.add(row.id)
  }

  for (const link of links) {
    if (
      typeof link.source_image_id === 'string' &&
      link.source_image_id &&
      typeof link.linked_image_id === 'string' &&
      link.linked_image_id
    ) {
      linkedGroups.union(link.source_image_id, link.linked_image_id)
    }
  }

  const grouped = new Map<string, SubmissionGroupAggregate>()

  for (const row of rows) {
    const groupKey = resolveGroupKey(row.id, row.submission_id, linkedGroups)
    const existing = grouped.get(groupKey)
    const routeLinesCount = pickRouteLinesCount(row.route_lines)
    const cragName = pickCragName(row.crags)

    if (!existing) {
      const canonical = row.submission_id
        ? rows.find((candidate) => candidate.submission_id === row.submission_id && candidate.id === row.id) || row
        : rowByImageId.get(groupKey) || row
      grouped.set(groupKey, {
        id: groupKey,
        canonical_image_id: canonical.id,
        canonical_url: canonical.url,
        route_image_id: routeLinesCount > 0 ? row.id : null,
        route_line_id: routeLinesCount > 0 ? pickFirstRouteLine(row.route_lines)?.id || null : null,
        climb_id: routeLinesCount > 0 ? pickFirstRouteLine(row.route_lines)?.climb_id || null : null,
        created_at: row.created_at,
        updated_at: row.created_at,
        crag_name: cragName,
        route_lines_count: routeLinesCount,
        is_anonymous_submission: row.is_anonymous_submission === true,
        contribution_credit_platform: row.contribution_credit_platform || null,
        contribution_credit_handle: row.contribution_credit_handle || null,
        image_ids: [row.id],
        has_published_image: row.moderation_status === 'approved',
      })
      continue
    }

    if (new Date(row.created_at).getTime() > new Date(existing.updated_at).getTime()) {
      existing.updated_at = row.created_at
    }

    existing.route_lines_count += routeLinesCount
    if (!existing.route_image_id && routeLinesCount > 0) {
      const firstRouteLine = pickFirstRouteLine(row.route_lines)
      existing.route_image_id = row.id
      existing.route_line_id = firstRouteLine?.id || null
      existing.climb_id = firstRouteLine?.climb_id || null
    }
    if (!existing.crag_name && cragName) {
      existing.crag_name = cragName
    }
    if (row.is_anonymous_submission === true) {
      existing.is_anonymous_submission = true
    }
    if (!existing.contribution_credit_handle && row.contribution_credit_handle) {
      existing.contribution_credit_handle = row.contribution_credit_handle
      existing.contribution_credit_platform = row.contribution_credit_platform || null
    }
    if (!existing.image_ids.includes(row.id)) {
      existing.image_ids.push(row.id)
    }
    if (row.moderation_status === 'approved') {
      existing.has_published_image = true
    }
  }

  return [...grouped.values()]
    .map((group) => ({
      id: group.id,
      canonical_image_id: group.canonical_image_id,
      route_image_id: group.route_image_id,
      route_line_id: group.route_line_id,
      climb_id: group.climb_id,
      kind: 'submitted' as const,
      status: toSubmittedStatus(group.has_published_image ? 'approved' : 'pending'),
      url: group.canonical_url,
      created_at: group.created_at,
      updated_at: group.updated_at,
      crag_name: group.crag_name,
      route_lines_count: group.route_lines_count,
      is_anonymous_submission: group.is_anonymous_submission,
      contribution_credit_platform: group.contribution_credit_platform,
      contribution_credit_handle: group.contribution_credit_handle,
      image_ids: group.image_ids,
      image_count: group.image_ids.length,
    }))
    .filter((submission) => submission.route_lines_count >= 0)
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
}
