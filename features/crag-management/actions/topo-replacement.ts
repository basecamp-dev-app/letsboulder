'use server'

import { z } from 'zod'

import { getActionAuth } from '@/lib/actions/action-auth'
import { fail, ok, type ActionResult } from '@/lib/actions/action-result'
import { validateActionInput } from '@/lib/actions/validate-action-input'
import { getServerClient } from '@/lib/supabase-server'

const startSchema = z.object({
  cragId: z.uuid(),
  imageId: z.uuid(),
  reason: z.string().trim().min(1, 'Enter a replacement reason').max(500),
  clientMutationId: z.uuid().optional(),
})

const resolutionSchema = z.object({
  replacementId: z.uuid(),
  climbId: z.uuid(),
  resolution: z.enum(['pending', 'mapped', 'not_visible']),
  draftRouteId: z.uuid().nullable().optional(),
})

interface StartedTopoReplacement {
  replacementId: string
  draftId: string
  status: string
  resumed: boolean
}

interface UpdatedTopoReplacementRoute {
  replacementId: string
  climbId: string
  resolution: 'pending' | 'mapped' | 'not_visible'
  draftRouteId: string | null
}

function jsonRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

export async function startTopoReplacementAction(input: unknown): Promise<ActionResult<StartedTopoReplacement>> {
  const validation = validateActionInput(startSchema, input)
  if (!validation.success) {
    return fail(validation.result.error || 'Invalid replacement request', validation.result.status || 400, validation.result.fieldErrors)
  }
  const auth = await getActionAuth()
  if (!auth.success) return fail(auth.error || 'Authentication required', auth.status || 401)

  const supabase = await getServerClient()
  const { data, error } = await supabase.rpc('start_topo_replacement', {
    p_crag_id: validation.data.cragId,
    p_source_image_id: validation.data.imageId,
    p_reason: validation.data.reason,
    ...(validation.data.clientMutationId
      ? { p_client_mutation_id: validation.data.clientMutationId }
      : {}),
  })
  if (error) {
    if (error.code === '42501') return fail('Crag management access required', 403)
    if (error.code === '22023') return fail(error.message, 400)
    if (error.code === '55000') return fail(error.message, 409)
    return fail('Failed to start topo replacement', 500)
  }

  const result = jsonRecord(data)
  const replacementId = typeof result?.replacement_id === 'string' ? result.replacement_id : null
  const draftId = typeof result?.draft_id === 'string' ? result.draft_id : null
  if (!replacementId || !draftId) return fail('Failed to create replacement draft', 500)

  return ok({
    replacementId,
    draftId,
    status: typeof result?.status === 'string' ? result.status : 'draft',
    resumed: result?.resumed === true,
  })
}

export async function setTopoReplacementRouteAction(input: unknown): Promise<ActionResult<UpdatedTopoReplacementRoute>> {
  const validation = validateActionInput(resolutionSchema, input)
  if (!validation.success) {
    return fail(validation.result.error || 'Invalid route mapping', validation.result.status || 400, validation.result.fieldErrors)
  }
  const auth = await getActionAuth()
  if (!auth.success) return fail(auth.error || 'Authentication required', auth.status || 401)

  const supabase = await getServerClient()
  const { data, error } = await supabase.rpc('set_topo_replacement_route_resolution', {
    p_replacement_id: validation.data.replacementId,
    p_climb_id: validation.data.climbId,
    p_resolution: validation.data.resolution,
    ...(validation.data.resolution === 'mapped' && validation.data.draftRouteId
      ? { p_draft_route_id: validation.data.draftRouteId }
      : {}),
  })
  if (error) {
    if (error.code === '42501') return fail('Crag management access required', 403)
    if (error.code === '22023' || error.code === 'P0002' || error.code === '23505') return fail(error.message, 400)
    return fail('Failed to update route mapping', 500)
  }

  const result = jsonRecord(data)
  return ok({
    replacementId: validation.data.replacementId,
    climbId: validation.data.climbId,
    resolution: validation.data.resolution,
    draftRouteId: typeof result?.draft_route_id === 'string' ? result.draft_route_id : null,
  })
}
