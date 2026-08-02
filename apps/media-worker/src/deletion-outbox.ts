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
    return false
  }

  if (job.reason === 'source_replaced' && (!job.image_id || !job.delivery_verified_at)) {
    await transitionJob(env, 'fail_media_deletion_job', job, new Error('Source replacement deletion is not delivery-verified'))
    return false
  }

  if (job.reason === 'reconciled_orphan'
    && (job.source_type !== 'image' || !job.image_id || job.source_id !== job.image_id
      || !job.expected_object_etag || !job.expected_object_bytes
      || !job.reconciliation_run_id || !job.reconciliation_artifact_digest)) {
    await transitionJob(env, 'fail_media_deletion_job', job, new Error('Reconciled orphan deletion metadata is inconsistent'))
    return false
  }

  if (job.reason === 'reconciled_orphan') {
    const orphanPrefix = new RegExp(`^images/originals/${job.image_id}/[^/]+$`)
    if (!orphanPrefix.test(job.object_key)) {
      await transitionJob(env, 'fail_media_deletion_job', job, new Error('Reconciled orphan key is not an original namespaced to the image'))
      return false
    }

    const { error: verificationError } = await createSupabaseAdminClient(env).rpc(
      'verify_reconciled_orphan_deletion',
      { p_job_id: job.id, p_claim_token: job.claim_token },
    )
    if (verificationError) {
      await transitionJob(env, 'retry_media_deletion_job', job, verificationError)
      return false
    }

    try {
      const object = await env.ORIGINALS_BUCKET.head(job.object_key)
      if (!object || object.size !== job.expected_object_bytes || object.etag !== job.expected_object_etag) {
        await transitionJob(env, 'fail_media_deletion_job', job, new Error('Reconciled orphan object no longer matches reviewed metadata'))
        return false
      }
    } catch (error) {
      await transitionJob(env, 'retry_media_deletion_job', job, error)
      return false
    }
  }

  if (job.image_id) {
    const namespacedPrefix = new RegExp(`^images/(?:assets|originals|staging)/${job.image_id}/`)
    if (!namespacedPrefix.test(job.object_key)) {
      await transitionJob(env, 'fail_media_deletion_job', job, new Error('Deletion key is not namespaced to the image'))
      return false
    }
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
    return true
  } catch (error) {
    await transitionJob(env, 'retry_media_deletion_job', job, error)
    console.warn('Retrying media deletion job', {
      jobId: job.id,
      reason: job.reason,
      attempt: job.attempts,
      durationMs: Date.now() - startedAt,
      error: stringifyError(error),
    })
    return true
  }
}

export async function drainMediaDeletionOutbox(
  env: Env,
  workerName = DELETION_WORKER_NAME,
  limit = DELETION_DRAIN_LIMIT,
) {
  const drainLimit = Math.min(Math.max(0, limit), DELETION_DRAIN_LIMIT)
  const supabase = createSupabaseAdminClient(env)
  let processed = 0

  for (let index = 0; index < drainLimit; index += 1) {
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
    const consistent = await processMediaDeletionJob(parsed.data, env)
    processed += 1
    if (!consistent) break
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
