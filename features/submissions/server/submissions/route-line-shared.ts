import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createErrorResponse } from '@/lib/errors'

export interface SubmissionRouteMutationDeps {
  supabase: ReturnType<typeof createServerClient>
  supabaseAdmin: ReturnType<typeof createServerClient> | null
  userId: string
  imageId: string
}

export async function revalidateSubmissionImagePaths(
  supabase: ReturnType<typeof createServerClient>,
  cragId: string | null
) {
  const { revalidatePath } = await import('next/cache')

  revalidatePath('/')
  if (!cragId) return

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
  supabase: ReturnType<typeof createServerClient>,
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

  if (ownerId !== userId) {
    const { data: collaboratorAccess, error: collaboratorError } = await supabase
      .from('submission_collaborators')
      .select('image_id')
      .eq('image_id', imageId)
      .eq('user_id', userId)
      .maybeSingle()

    if (collaboratorError || !collaboratorAccess) {
      return { error: NextResponse.json({ error: forbiddenMessage }, { status: 403 }) }
    }
  }

  return { image, ownerId }
}
