'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'

import { revalidatePublicCragPaths } from '@/features/crags/public-server'
import { getActionAuth } from '@/lib/actions/action-auth'
import { fail, ok, type ActionResult } from '@/lib/actions/action-result'
import { validateActionInput } from '@/lib/actions/validate-action-input'
import { getServerClient } from '@/lib/supabase-server'

const removeCragImageSchema = z.object({
  cragId: z.uuid(),
  imageId: z.uuid(),
  reason: z.string().trim().min(1, 'Enter a deletion reason').max(500, 'Deletion reason must be 500 characters or fewer'),
  deleteRoutes: z.boolean().optional().default(false),
})

export interface RemovedCragImageResult {
  imageId: string
}

export async function removeCragImageAction(input: unknown): Promise<ActionResult<RemovedCragImageResult>> {
  const validation = validateActionInput(removeCragImageSchema, input)
  if (!validation.success) {
    return fail(validation.result.error || 'Invalid request data', validation.result.status || 400, validation.result.fieldErrors)
  }

  const auth = await getActionAuth()
  if (!auth.success) return fail(auth.error || 'Authentication required', auth.status || 401)

  const supabase = await getServerClient()
  const { data: crag, error: cragError } = await supabase
    .from('crags')
    .select('id, country_code, slug')
    .eq('id', validation.data.cragId)
    .maybeSingle()
  if (cragError) return fail('Failed to load crag cache context', 500)
  if (!crag) return fail('Crag not found', 404)

  const { error } = await supabase.rpc('soft_delete_crag_image', {
    p_crag_id: validation.data.cragId,
    p_image_id: validation.data.imageId,
    p_reason: validation.data.reason,
    p_delete_routes: validation.data.deleteRoutes,
  })
  if (error) {
    if (error.code === '42501') return fail('Administrator access required', 403)
    if (error.code === 'P0002') return fail(error.message, 404)
    if (error.code === '22023') return fail(error.message, 400)
    return fail('Failed to remove image', 500)
  }

  revalidatePublicCragPaths({
    cragId: crag.id,
    countryCode: crag.country_code,
    slug: crag.slug,
  })
  revalidatePath(`/crag/${crag.id}`)
  revalidatePath(`/image/${validation.data.imageId}`)
  if (crag.country_code && crag.slug) {
    revalidatePath(`/${crag.country_code.toLowerCase()}/${crag.slug}/i/${validation.data.imageId}`)
  }
  return ok({ imageId: validation.data.imageId })
}
