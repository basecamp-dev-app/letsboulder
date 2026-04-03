import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

export async function userOwnsUploadedObject(
  supabase: SupabaseClient<Database>,
  userId: string,
  bucket: string,
  path: string
): Promise<boolean> {
  if (path.startsWith(`${userId}/`)) {
    return true
  }

  const byOriginal = await supabase
    .from('images')
    .select('id')
    .eq('created_by', userId)
    .eq('original_bucket', bucket)
    .eq('original_key', path)
    .maybeSingle()

  if (byOriginal.data) {
    return true
  }

  const byLegacyStorage = await supabase
    .from('images')
    .select('id')
    .eq('created_by', userId)
    .eq('storage_bucket', bucket)
    .eq('storage_path', path)
    .maybeSingle()

  return Boolean(byLegacyStorage.data)
}
