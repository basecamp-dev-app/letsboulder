import { createClient } from '@supabase/supabase-js'
import type { MediaIngestJobPayload } from '@/lib/media/types'
import { serverEnv } from '@/lib/env'

function getSupabaseAdminClient() {
  const supabaseUrl = serverEnv.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = serverEnv.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing Supabase admin configuration for media jobs')
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

export async function enqueueImageIngestJob(payload: MediaIngestJobPayload) {
  const supabase = getSupabaseAdminClient()

  const { data, error } = await supabase
    .from('media_jobs')
    .insert({
      image_id: payload.imageId,
      job_type: 'ingest_image',
      status: 'queued',
      payload,
    })
    .select('id, image_id, job_type, status, payload, attempts, max_attempts, run_at, locked_at, locked_by, last_error')
    .single()

  if (error) {
    throw error
  }

  return data
}
