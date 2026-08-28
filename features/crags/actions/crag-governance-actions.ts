'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { z } from 'zod'

import type {
  CragMaintainerItem,
  CragMetadataProposalResult,
  CragMetadataReviewItem,
  CragMetadataReviewResult,
} from '@/features/crags/actions/crag-governance-types'
import { revalidatePublicCrag, revalidatePublicCragSlug } from '@/features/crags/server/crag-cache-tags'
import { getActionAuth } from '@/lib/actions/action-auth'
import { fail, ok, type ActionResult } from '@/lib/actions/action-result'
import { validateActionInput } from '@/lib/actions/validate-action-input'
import { getServerClient } from '@/lib/supabase-server'
import { getAdminClientWithAudit } from '@/lib/supabase-admin'
import { resolveRouteImageUrl } from '@/lib/media/route-image-url'
import { rateLimit } from '@/lib/rate-limit'
import type { Database, Json } from '@/types/database'

type ProposalRow = Database['public']['Tables']['crag_metadata_proposals']['Row']
type MaintainerRow = Database['public']['Tables']['crag_maintainers']['Row']
type ProposeArgs = Database['public']['Functions']['propose_crag_metadata']['Args']
type ReviewArgs = Database['public']['Functions']['review_crag_metadata_proposal']['Args']
type SetMaintainerArgs = Database['public']['Functions']['set_crag_maintainer']['Args']
type SetPublicationArgs = Database['public']['Functions']['set_crag_publication_status']['Args']

const proposeSchema = z.object({
  cragId: z.uuid(),
  clientMutationId: z.uuid(),
  name: z.string().trim().min(1).max(200),
  regionName: z.string().trim().min(1).max(100),
  subArea: z.string().trim().max(120).nullable().optional(),
  reason: z.string().trim().min(10).max(1000),
  sourceImageId: z.uuid().nullable().optional(),
})

const reviewSchema = z.object({
  proposalId: z.uuid(),
  decision: z.enum(['approve', 'reject']),
  reviewNote: z.string().trim().max(1000).nullable().optional(),
})

const cragSchema = z.object({ cragId: z.uuid() })
const setMaintainerSchema = cragSchema.extend({
  userReference: z.string().trim().min(1).max(320),
  isMaintainer: z.boolean(),
})
const publicationStatusSchema = z.enum(['draft', 'review', 'published', 'archived'])
const setPublicationSchema = cragSchema.extend({
  status: publicationStatusSchema,
  notes: z.string().trim().max(1000).nullable().optional(),
})

function isRecord(value: Json): value is { [key: string]: Json | undefined } {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readString(value: Json | undefined): string | null {
  return typeof value === 'string' ? value : null
}

function failureFor<T>(result: Pick<ActionResult<unknown>, 'error' | 'status' | 'fieldErrors'>): ActionResult<T> {
  return fail(result.error || 'Request failed', result.status || 500, result.fieldErrors)
}

function mapRpcError<T>(error: { code?: string; message: string; details?: string }, fallback: string): ActionResult<T> {
  if (error.details === 'open_data_consent_required') return fail('OPEN_DATA_CONSENT_REQUIRED', 428)
  if (error.code === '42501') return fail(error.message, 403)
  if (error.code === 'P0002') return fail(error.message, 404)
  if (error.code === '22023') return fail(error.message, error.details === 'idempotency_conflict' ? 409 : 400)
  return fail(fallback, 500)
}

async function requireAdmin(): Promise<ActionResult> {
  const auth = await getActionAuth()
  if (!auth.success) return fail(auth.error || 'Authentication required', auth.status || 401)

  const supabase = await getServerClient()
  const { data, error } = await supabase.rpc('is_current_user_admin')
  if (error || data !== true) return fail('Administrator access required', 403)
  return ok()
}

export async function proposeCragMetadataAction(input: unknown): Promise<ActionResult<CragMetadataProposalResult>> {
  const validation = validateActionInput(proposeSchema, input)
  if (!validation.success) return failureFor<CragMetadataProposalResult>(validation.result)

  const auth = await getActionAuth()
  if (!auth.success) return failureFor<CragMetadataProposalResult>(auth)

  const requestHeaders = await headers()
  const actionRequest = new Request('http://localhost/server-action', { headers: requestHeaders })
  const rateLimitResult = await rateLimit(actionRequest, 'strict')
  if (!rateLimitResult.success) return fail('Too many proposal requests. Please try again later.', 429)

  const args: ProposeArgs = {
    p_crag_id: validation.data.cragId,
    p_client_mutation_id: validation.data.clientMutationId,
    p_name: validation.data.name,
    p_region_name: validation.data.regionName,
    p_sub_area: validation.data.subArea || undefined,
    p_reason: validation.data.reason,
    p_source_image_id: validation.data.sourceImageId || undefined,
  }
  const supabase = await getServerClient()
  const { data, error } = await supabase.rpc('propose_crag_metadata', args)
  if (error) return mapRpcError<CragMetadataProposalResult>(error, 'Failed to submit crag metadata proposal')
  if (!isRecord(data)) return fail('Proposal returned an invalid response', 500)

  const proposalId = readString(data.proposalId)
  const status = readString(data.status)
  const baseRevisionId = readString(data.baseRevisionId)
  if (!proposalId || !status || !baseRevisionId || typeof data.replayed !== 'boolean') {
    return fail('Proposal returned an invalid response', 500)
  }

  revalidatePath('/maintain/crags')
  return ok({ proposalId, status, baseRevisionId, replayed: data.replayed })
}

export async function reviewCragMetadataProposalAction(input: unknown): Promise<ActionResult<CragMetadataReviewResult>> {
  const validation = validateActionInput(reviewSchema, input)
  if (!validation.success) return failureFor<CragMetadataReviewResult>(validation.result)

  const auth = await getActionAuth()
  if (!auth.success) return failureFor<CragMetadataReviewResult>(auth)

  const args: ReviewArgs = {
    p_proposal_id: validation.data.proposalId,
    p_decision: validation.data.decision,
    p_review_note: validation.data.reviewNote || undefined,
  }
  const supabase = await getServerClient()
  const { data: proposal, error: proposalError } = await supabase
    .from('crag_metadata_proposals')
    .select('crag_id, crags!inner(slug, country_code)')
    .eq('id', validation.data.proposalId)
    .maybeSingle()
  if (proposalError || !proposal) return fail('Failed to load proposal cache context', 500)
  const { data, error } = await supabase.rpc('review_crag_metadata_proposal', args)
  if (error) return mapRpcError<CragMetadataReviewResult>(error, 'Failed to review crag metadata proposal')
  if (!isRecord(data)) return fail('Review returned an invalid response', 500)

  const proposalId = readString(data.proposalId)
  const status = readString(data.status)
  if (!proposalId || !status) return fail('Review returned an invalid response', 500)

  revalidatePath('/')
  revalidatePath('/maintain/crags')
  revalidatePath('/admin/crags')
  const crag = Array.isArray(proposal?.crags) ? proposal.crags[0] : proposal?.crags
  if (status === 'approved' && proposal) {
    revalidatePublicCrag(proposal.crag_id)
    if (crag?.country_code && crag.slug) {
      revalidatePublicCragSlug(crag.country_code, crag.slug)
      revalidatePath(`/${crag.country_code.toLowerCase()}/${crag.slug}`)
    }
  }
  return ok({ proposalId, status })
}

export async function listCragMetadataProposalsAction(selectedProposalId?: string): Promise<ActionResult<CragMetadataReviewItem[]>> {
  const auth = await getActionAuth()
  if (!auth.success || !auth.data?.userId) return fail(auth.error || 'Authentication required', auth.status || 401)

  const supabase = await getServerClient()
  let query = supabase
    .from('crag_metadata_proposals')
    .select('*, crags!inner(id, name, region_name, sub_area), images(id, url, created_at)')
    .order('created_at', { ascending: true })
  query = selectedProposalId
    ? query.or(`status.eq.pending,id.eq.${selectedProposalId}`)
    : query.eq('status', 'pending')
  const { data, error } = await query
  if (error) return fail('Failed to load reviewable proposals', 500)

  const rows = (data || []).filter((row) => row.proposer_id !== auth.data?.userId || row.id === selectedProposalId)
  const proposerIds = [...new Set(rows
    .map((row) => row.proposer_id)
    .filter((id): id is string => typeof id === 'string'))]
  const { data: profiles } = proposerIds.length > 0
    ? await supabase.from('profiles').select('id, display_name, username').in('id', proposerIds)
    : { data: [] }
  const profileNames = new Map((profiles || []).map((profile) => [
    profile.id,
    profile.display_name?.trim() || (profile.username ? `@${profile.username}` : null),
  ]))

  const items: CragMetadataReviewItem[] = rows.map((row) => ({
    proposal: row as ProposalRow,
    canonical: {
      id: row.crags.id,
      name: row.crags.name,
      regionName: row.crags.region_name,
      subArea: row.crags.sub_area,
    },
    proposerName: row.proposer_id ? profileNames.get(row.proposer_id) || null : null,
    reviewable: row.status === 'pending' && row.proposer_id !== auth.data?.userId,
    sourceImage: row.images ? {
      id: row.images.id,
      url: resolveRouteImageUrl(row.images.url),
      createdAt: row.images.created_at,
    } : null,
  }))
  return ok(items)
}

export async function listCragMaintainersAction(input: unknown): Promise<ActionResult<CragMaintainerItem[]>> {
  const validation = validateActionInput(cragSchema, input)
  if (!validation.success) return failureFor<CragMaintainerItem[]>(validation.result)
  const admin = await requireAdmin()
  if (!admin.success) return failureFor<CragMaintainerItem[]>(admin)

  const supabase = await getServerClient()
  const { data, error } = await supabase
    .from('crag_maintainers')
    .select('*')
    .eq('crag_id', validation.data.cragId)
    .order('created_at')
  if (error) return fail('Failed to load crag maintainers', 500)

  const assignments = (data || []) as MaintainerRow[]
  const userIds = assignments.map((assignment) => assignment.user_id)
  const profileAdmin = getAdminClientWithAudit(`list crag maintainers for ${validation.data.cragId}`)
  const { data: profiles, error: profilesError } = userIds.length > 0
    ? await profileAdmin.from('profiles').select('id, display_name, username, email').in('id', userIds)
    : { data: [], error: null }
  if (profilesError) return fail('Failed to load crag maintainer profiles', 500)
  const profilesById = new Map((profiles || []).map((profile) => [profile.id, profile]))

  return ok(assignments.map((assignment) => {
    const profile = profilesById.get(assignment.user_id)
    return {
      assignment,
      displayName: profile?.display_name || null,
      username: profile?.username || null,
      email: profile?.email || null,
    }
  }))
}

export async function setCragMaintainerAction(input: unknown): Promise<ActionResult<{ userId: string; isMaintainer: boolean }>> {
  const validation = validateActionInput(setMaintainerSchema, input)
  if (!validation.success) return failureFor<{ userId: string; isMaintainer: boolean }>(validation.result)
  const admin = await requireAdmin()
  if (!admin.success) return failureFor<{ userId: string; isMaintainer: boolean }>(admin)

  const supabase = await getServerClient()
  const reference = validation.data.userReference
  let userId = z.uuid().safeParse(reference).success ? reference : null
  if (!userId) {
    const profileReference = reference.startsWith('@') ? reference.slice(1) : reference
    const column = profileReference.includes('@') ? 'email' : 'username'
    const profileAdmin = getAdminClientWithAudit(`resolve crag maintainer by ${column}`)
    const { data: profile, error } = await profileAdmin
      .from('profiles')
      .select('id')
      .eq(column, profileReference)
      .maybeSingle()
    if (error) return fail('Failed to resolve that user', 500)
    userId = profile?.id || null
  }
  if (!userId) return fail('No user matched that exact UUID, username, or email', 404)

  const args: SetMaintainerArgs = {
    p_crag_id: validation.data.cragId,
    p_user_id: userId,
    p_is_maintainer: validation.data.isMaintainer,
  }
  const { data, error } = await supabase.rpc('set_crag_maintainer', args)
  if (error) return mapRpcError<{ userId: string; isMaintainer: boolean }>(error, 'Failed to update crag maintainer')

  revalidatePath('/admin/crags')
  revalidatePath('/maintain/crags')
  return ok({ userId, isMaintainer: data })
}

export async function setCragPublicationStatusAction(
  input: unknown,
): Promise<ActionResult<{ status: 'draft' | 'review' | 'published' | 'archived' }>> {
  const validation = validateActionInput(setPublicationSchema, input)
  if (!validation.success) {
    return failureFor<{ status: 'draft' | 'review' | 'published' | 'archived' }>(validation.result)
  }

  const auth = await getActionAuth()
  if (!auth.success) {
    return failureFor<{ status: 'draft' | 'review' | 'published' | 'archived' }>(auth)
  }

  const args: SetPublicationArgs = {
    p_crag_id: validation.data.cragId,
    p_status: validation.data.status,
    p_notes: validation.data.notes || undefined,
  }
  const supabase = await getServerClient()
  const { data, error } = await supabase.rpc('set_crag_publication_status', args)
  if (error) {
    return mapRpcError<{ status: 'draft' | 'review' | 'published' | 'archived' }>(
      error,
      'Failed to update publication status',
    )
  }
  const returnedStatus = publicationStatusSchema.safeParse(data)
  if (!returnedStatus.success) return fail('Publication update returned an invalid response', 500)

  revalidatePath('/')
  revalidatePath('/impact')
  revalidatePath('/sitemap.xml')
  revalidatePath('/sitemaps/crags/[page]', 'page')
  revalidatePath('/sitemaps/climbs/[page]', 'page')
  revalidatePath('/maintain/crags')
  revalidatePath(`/maintain/crags/${validation.data.cragId}`)
  revalidatePublicCrag(validation.data.cragId)
  return ok({ status: returnedStatus.data })
}
