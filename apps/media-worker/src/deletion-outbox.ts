import { createSupabaseAdminClient, type Env } from './supabase'
import { mediaDeletionJobSchema, type MediaDeletionJobRow } from './schema'

const DELETION_WORKER_NAME = 'media-worker-deletion-scheduled'
const DELETION_DRAIN_LIMIT = 25

function stringifyError(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  if (typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string') {
    return error.message
  }
  return 'Unknown media deletion error'
}

async function transitionJob(
  env: Env,
  operation: 'complete_media_deletion_job' | 'retry_media_deletion_job' | 'fail_media_deletion_job',
  job: MediaDeletionJobRow,
  error?: unknown,
) {
  const supabase = createSupabaseAdminClient(env)
  const args = {
    p_job_id: job.id,
    p_claim_token: job.claim_token,
    ...(operation === 'complete_media_deletion_job' ? {} : { p_error: stringifyError(error) }),
  }
  const { error: transitionError } = await supabase.rpc(operation, args)
  if (transitionError) throw transitionError
}

export async function processMediaDeletionJob(job: MediaDeletionJobRow, env: Env) {
  if (job.bucket !== env.R2_PRIVATE_BUCKET) {
    await transitionJob(env, 'fail_media_deletion_job', job, new Error('Deletion bucket is not allowlisted'))
    return
  }

  const startedAt = Date.now()
  try {
    await env.ORIGINALS_BUCKET.delete(job.object_key)
    await transitionJob(env, 'complete_media_deletion_job', job)
    console.log('Completed media deletion job', {
      jobId: job.id,
      reason: job.reason,
      attempt: job.attempts,
      durationMs: Date.now() - startedAt,
    })
  } catch (error) {
    await transitionJob(env, 'retry_media_deletion_job', job, error)
    console.warn('Retrying media deletion job', {
      jobId: job.id,
      reason: job.reason,
      attempt: job.attempts,
      durationMs: Date.now() - startedAt,
      error: stringifyError(error),
    })
  }
}

export async function drainMediaDeletionOutbox(
  env: Env,
  workerName = DELETION_WORKER_NAME,
  limit = DELETION_DRAIN_LIMIT,
) {
  const supabase = createSupabaseAdminClient(env)
  let processed = 0

  for (let index = 0; index < limit; index += 1) {
    const { data, error } = await supabase.rpc('claim_media_deletion_job', {
      worker_name: workerName,
      lease_seconds: 900,
    })
    if (error) throw error
    if (!data || typeof data !== 'object' || !('id' in data) || data.id === null) break

    const parsed = mediaDeletionJobSchema.safeParse(data)
    if (!parsed.success) {
      throw new Error(`Invalid claimed media deletion job: ${parsed.error.message}`)
    }
    await processMediaDeletionJob(parsed.data, env)
    processed += 1
  }

  return processed
}

export async function pruneMediaDeletionOutbox(env: Env) {
  const { data, error } = await createSupabaseAdminClient(env).rpc('prune_media_deletion_jobs', {
    retention_days: 30,
    max_delete: 500,
  })
  if (error) throw error
  return typeof data === 'number' ? data : 0
}
