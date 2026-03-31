import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createErrorResponse } from '@/lib/errors'
import { deleteObject } from '@/lib/media/r2'
import type { Database } from '@/types/database'

type ImageStorageRow = Pick<
  Database['public']['Tables']['images']['Row'],
  'id' | 'created_by' | 'storage_provider' | 'storage_bucket' | 'storage_path' | 'original_bucket' | 'original_key' | 'submission_id'
>

interface DeleteSubmissionDeps {
  supabase: ReturnType<typeof createServerClient>
  supabaseAdmin: ReturnType<typeof createServerClient>
  userId: string
  imageId: string
}

export async function deleteSubmission(deps: DeleteSubmissionDeps) {
  const { supabase, supabaseAdmin, userId, imageId } = deps

  const { data: image, error: imageError } = await supabase
    .from('images')
    .select('id, created_by, submission_id, crag_id, storage_provider, storage_bucket, storage_path, original_bucket, original_key')
    .eq('id', imageId)
    .maybeSingle()

  if (imageError) return createErrorResponse(imageError, 'Delete submission error')

  if (!image) {
    return NextResponse.json({ error: 'Submission not found' }, { status: 404 })
  }

  if (image.created_by !== userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const submissionId = image.submission_id
  const cragId = image.crag_id

  const allImages: ImageStorageRow[] = [image as ImageStorageRow]

  if (submissionId) {
    const { data: siblingImages, error: siblingError } = await supabase
      .from('images')
      .select('id, created_by, submission_id, storage_provider, storage_bucket, storage_path, original_bucket, original_key')
      .eq('submission_id', submissionId)
      .neq('id', imageId)

    if (siblingError) return createErrorResponse(siblingError, 'Delete submission error')

    for (const sibling of siblingImages || []) {
      if (sibling.created_by === userId) {
        allImages.push(sibling as ImageStorageRow)
      }
    }
  }

  const imageIds = allImages.map((img) => img.id)

  const { data: routeLines, error: routeLinesError } = await supabase
    .from('route_lines')
    .select('id, climb_id')
    .in('image_id', imageIds)

  if (routeLinesError) return createErrorResponse(routeLinesError, 'Delete submission error')

  const climbIds = [...new Set((routeLines || []).map((rl: { climb_id: string }) => rl.climb_id))]

  if (climbIds.length > 0) {
    const { error: deleteLogsError } = await supabase
      .from('user_climbs')
      .delete()
      .in('climb_id', climbIds)
      .eq('user_id', userId)

    if (deleteLogsError) return createErrorResponse(deleteLogsError, 'Delete submission error')
  }

  const writeClient = supabaseAdmin || supabase

  const { error: deleteFlagsError } = await writeClient
    .from('climb_flags')
    .delete()
    .in('climb_id', climbIds)
    .eq('flagged_by', userId)

  if (deleteFlagsError) {
    // non-fatal
  }

  const { error: deleteImageFlagsError } = await writeClient
    .from('image_flags')
    .delete()
    .in('image_id', imageIds)
    .eq('flagged_by', userId)

  if (deleteImageFlagsError) {
    // non-fatal
  }

  const { error: deleteCollaboratorsError } = await writeClient
    .from('submission_collaborators')
    .delete()
    .in('image_id', imageIds)

  if (deleteCollaboratorsError) {
    // non-fatal
  }

  const { data: cragImageLinks, error: cragLinksError } = await writeClient
    .from('crag_images')
    .select('id')
    .in('linked_image_id', imageIds)

  if (cragLinksError) return createErrorResponse(cragLinksError, 'Delete submission error')

  const cragImageIds = (cragImageLinks || []).map((link: { id: string }) => link.id)

  if (cragImageIds.length > 0) {
    const { error: deleteCragImagesError } = await writeClient
      .from('crag_images')
      .delete()
      .in('id', cragImageIds)

    if (deleteCragImagesError) return createErrorResponse(deleteCragImagesError, 'Delete submission error')
  }

  const { error: deleteImagesError } = await writeClient
    .from('images')
    .delete()
    .in('id', imageIds)

  if (deleteImagesError) return createErrorResponse(deleteImagesError, 'Delete submission error')

  if (climbIds.length > 0) {
    const { data: remainingRouteLines } = await writeClient
      .from('route_lines')
      .select('climb_id')
      .in('climb_id', climbIds)

    const climbIdsWithRoutes = new Set((remainingRouteLines || []).map((rl: { climb_id: string }) => rl.climb_id))
    const orphanClimbIds = climbIds.filter((id) => !climbIdsWithRoutes.has(id))

    if (orphanClimbIds.length > 0) {
      await writeClient.from('climbs').delete().in('id', orphanClimbIds)
    }
  }

  const storageRows = allImages.map((img) => ({
    storage_provider: img.storage_provider,
    storage_bucket: img.storage_bucket,
    storage_path: img.storage_path,
    original_bucket: img.original_bucket,
    original_key: img.original_key,
  }))

  for (const row of storageRows) {
    const provider = row.storage_provider === 'r2' ? 'r2' : 'supabase'

    if (provider === 'r2' && row.original_bucket && row.original_key) {
      try {
        await deleteObject(row.original_bucket, row.original_key)
      } catch {
        // non-fatal, storage cleanup best-effort
      }
    } else if (row.storage_bucket && row.storage_path) {
      try {
        await writeClient.storage.from(row.storage_bucket).remove([row.storage_path])
      } catch {
        // non-fatal
      }
    }
  }

  const { revalidatePath } = await import('next/cache')
  revalidatePath('/')

  if (cragId) {
    const { data: cragData } = await writeClient
      .from('crags')
      .select('slug, country_code')
      .eq('id', cragId)
      .single()

    if (cragData?.slug && cragData?.country_code) {
      revalidatePath(`/${cragData.country_code.toLowerCase()}/${cragData.slug}`)
    }
  }

  return NextResponse.json({ success: true })
}
