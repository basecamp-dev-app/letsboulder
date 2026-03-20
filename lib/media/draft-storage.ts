import type { SupabaseClient } from '@supabase/supabase-js'
import { generateErrorId } from '@/lib/errors'
import { deleteObject } from '@/lib/media/r2'
import type { Database } from '@/types/database'

type DraftImageStorageRow = Pick<
  Database['public']['Tables']['submission_draft_images']['Row'],
  'storage_provider' | 'storage_bucket' | 'storage_path'
>

type DraftStorageProvider = DraftImageStorageRow['storage_provider'] | null | undefined

export type DraftStorageCleanupRow = DraftImageStorageRow

function resolveProvider(provider: DraftStorageProvider): 'r2' | 'supabase' {
  return provider === 'r2' ? 'r2' : 'supabase'
}

function logStorageCleanupWarning(image: DraftStorageCleanupRow, error: unknown) {
  const errorId = generateErrorId()
  const message = error instanceof Error ? error.message : String(error)

  console.warn(
    `[${errorId}] Draft storage cleanup failed`,
    {
      storage_provider: image.storage_provider ?? null,
      storage_bucket: image.storage_bucket,
      storage_path: image.storage_path,
      error: message,
    }
  )
}

export async function cleanupDraftStorageObjects(
  storageClient: SupabaseClient<Database>,
  images: DraftStorageCleanupRow[]
) {
  const supabasePathsByBucket = new Map<string, string[]>()

  for (const image of images) {
    if (!image.storage_bucket || !image.storage_path) continue

    const provider = resolveProvider(image.storage_provider)

    if (provider === 'r2') {
      try {
        await deleteObject(image.storage_bucket, image.storage_path)
      } catch (error) {
        logStorageCleanupWarning(image, error)
      }
      continue
    }

    const existingPaths = supabasePathsByBucket.get(image.storage_bucket) || []
    existingPaths.push(image.storage_path)
    supabasePathsByBucket.set(image.storage_bucket, existingPaths)
  }

  for (const [bucket, paths] of supabasePathsByBucket.entries()) {
    const uniquePaths = Array.from(new Set(paths))
    if (uniquePaths.length === 0) continue

    try {
      const { error } = await storageClient.storage.from(bucket).remove(uniquePaths)
      if (error) {
        for (const storagePath of uniquePaths) {
          logStorageCleanupWarning({ storage_provider: 'supabase', storage_bucket: bucket, storage_path: storagePath }, error)
        }
      }
    } catch (error) {
      for (const storagePath of uniquePaths) {
        logStorageCleanupWarning({ storage_provider: 'supabase', storage_bucket: bucket, storage_path: storagePath }, error)
      }
    }
  }
}
