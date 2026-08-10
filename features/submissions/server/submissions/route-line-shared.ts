import { NextResponse } from 'next/server'
import { getServerClientFromRequest } from '@/lib/supabase-server'
import { createErrorResponse } from '@/lib/errors'
import { revalidatePublicCrag } from '@/features/crags/public'

export interface SubmissionRouteMutationDeps {
  supabase: ReturnType<typeof getServerClientFromRequest>
  supabaseAdmin: ReturnType<typeof getServerClientFromRequest> | null
  userId: string
  imageId: string
}

export async function revalidateSubmissionImagePaths(
  supabase: ReturnType<typeof getServerClientFromRequest>,
  cragId: string | null
) {
  const { revalidatePath } = await import('next/cache')

  revalidatePath('/')
  if (!cragId) return
  revalidatePublicCrag(cragId)

  const { data: cragData } = await supabase
    .from('crags')
    .select('slug, country_code')
    .eq('id', cragId)
    .single()

  if (cragData?.slug && cragData?.country_code) {
    revalidatePath(`/${cragData.country_code.toLowerCase()}/${cragData.slug}`)
  }
}

export async function loadEditableImageContext(
  supabase: ReturnType<typeof getServerClientFromRequest>,
  imageId: string,
  userId: string,
  forbiddenMessage: string
) {
  const { data: image, error: imageError } = await supabase
    .from('images')
    .select('id, created_by, crag_id')
    .eq('id', imageId)
    .maybeSingle()

  if (imageError) {
    return { error: createErrorResponse(imageError, 'Submission route mutation error') }
  }

  if (!image) {
    return { error: NextResponse.json({ error: 'Image not found' }, { status: 404 }) }
  }

  const ownerId = typeof image.created_by === 'string' ? image.created_by : null
  if (!ownerId) {
    return { error: NextResponse.json({ error: 'This submission is not editable' }, { status: 403 }) }
  }

  const { data: canEdit, error: accessError } = await supabase.rpc('user_can_wiki_edit_submission', {
    p_image_id: imageId,
    p_user_id: userId,
  })

  if (accessError) {
    return { error: createErrorResponse(accessError, 'Submission route mutation error') }
  }

  if (canEdit !== true) {
    return { error: NextResponse.json({ error: forbiddenMessage }, { status: 403 }) }
  }

  return { image, ownerId }
}
