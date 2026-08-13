import { NextResponse } from 'next/server'
import { getServerClientFromRequest } from '@/lib/supabase-server'
import { createErrorResponse } from '@/lib/errors'
import { isCanonicalImageObjectKey } from '@/lib/media/deletion-key'
import { deleteObject } from '@/lib/media/r2'
import { revalidatePublicCrag } from '@/features/crags/public-server'
import type { Database } from '@/types/database'

type ImageStorageRow = Pick<
  Database['public']['Tables']['images']['Row'],
  'id' | 'created_by' | 'storage_provider' | 'storage_bucket' | 'storage_path' | 'original_bucket' | 'original_key' | 'submission_id'
>

interface DeleteSubmissionDeps {
  supabase: ReturnType<typeof getServerClientFromRequest>
  supabaseAdmin: ReturnType<typeof getServerClientFromRequest>
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
  const { data: cragData } = cragId
    ? await supabase.from('crags').select('slug, country_code').eq('id', cragId).maybeSingle()
    : { data: null }

  const { error: deleteSubmissionError } = await supabaseAdmin.rpc('soft_delete_published_submission', {
    p_image_ids: imageIds,
    p_owner_id: userId,
  })
  if (deleteSubmissionError) return createErrorResponse(deleteSubmissionError, 'Delete submission error')

  const storageRows = allImages.map((img) => ({
    image_id: img.id,
    storage_provider: img.storage_provider,
    storage_bucket: img.storage_bucket,
    storage_path: img.storage_path,
    original_bucket: img.original_bucket,
    original_key: img.original_key,
  }))

  for (const row of storageRows) {
    const provider = row.storage_provider === 'r2' ? 'r2' : 'supabase'

    if (provider === 'r2' && row.original_bucket && row.original_key
      && isCanonicalImageObjectKey(row.image_id, row.original_key)) {
      try {
        await deleteObject(row.original_bucket, row.original_key)
      } catch {
        // The durable deletion outbox remains authoritative.
      }
    } else if (row.storage_bucket && row.storage_path) {
      try {
        await supabaseAdmin.storage.from(row.storage_bucket).remove([row.storage_path])
      } catch {
        // non-fatal
      }
    }
  }

  const { revalidatePath } = await import('next/cache')
  revalidatePath('/')

  if (cragId) {
    revalidatePublicCrag(cragId)
    if (cragData?.slug && cragData?.country_code) {
      revalidatePath(`/${cragData.country_code.toLowerCase()}/${cragData.slug}`)
    }
  }

  return NextResponse.json({ success: true, cragId })
}
