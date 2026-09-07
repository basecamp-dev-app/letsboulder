import mediaWorker, { processJob } from './index'
import { drainMediaDeletionOutbox, pruneMediaDeletionOutbox } from './deletion-outbox'
import { mediaIngestJobSchema, type MediaJobRow } from './schema'
import { createSupabaseAdminClient, type Env, type MessageBatch } from './supabase'

const MEDIA_DRAIN_LIMIT = 4
const DELETION_DRAIN_LIMIT = 4
const MEDIA_JOB_LEASE_SECONDS = 300
const SCHEDULED_MEDIA_WORKER = 'media-worker-scheduled'
const QUEUED_MEDIA_DRAIN_WORKER = 'media-worker-queue-drain'
const SCHEDULED_DELETION_WORKER = 'media-deletion-worker'
const QUEUED_DELETION_DRAIN_WORKER = 'media-deletion-queue-drain'

type DrainContinuation =
  | { kind: 'drain-media' }
  | { kind: 'drain-deletions' }

function stringifyError(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  if (typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string') {
    return error.message
  }
  return 'Unknown media job error'
}

function isCloudflareTransformQuotaError(error: unknown): boolean {
  return stringifyError(error).includes('IMAGES_TRANSFORM_ERROR 9422')
}

function readContinuation(value: unknown): DrainContinuation | null {
  if (!value || typeof value !== 'object' || !('kind' in value)) return null
  const kind = value.kind
  if (kind === 'drain-media' || kind === 'drain-deletions') return { kind }
  return null
}

async function claimMediaJob(
  env: Env,
  workerName: string,
): Promise<MediaJobRow | null> {
  const { data, error } = await createSupabaseAdminClient(env).rpc('claim_media_job', {
    worker_name: workerName,
    lease_seconds: MEDIA_JOB_LEASE_SECONDS,
  })
  if (error) throw error
  if (!data || typeof data !== 'object' || !('id' in data) || data.id === null) return null
  return data as MediaJobRow
}

async function transitionMediaJob(
  env: Env,
  rpc: 'complete_media_job' | 'retry_media_job' | 'fail_media_job',
  job: MediaJobRow,
  error?: unknown,
) {
  const args: Record<string, unknown> = {
    p_job_id: job.id,
    p_claim_token: job.claim_token,
  }
  if (rpc !== 'complete_media_job') args.p_error = stringifyError(error)

  const { error: transitionError } = await createSupabaseAdminClient(env).rpc(rpc, args)
  if (transitionError) throw transitionError
}

async function processClaimedMediaJob(job: MediaJobRow, env: Env) {
  const parsed = mediaIngestJobSchema.safeParse(job.payload)
  if (!parsed.success) {
    await transitionMediaJob(env, 'fail_media_job', job, new Error('Invalid media ingest payload'))
    return
  }

  try {
    await processJob(parsed.data, env, undefined, {
      jobId: job.id,
      claimToken: job.claim_token,
    })
    await transitionMediaJob(env, 'complete_media_job', job)
    console.log('Completed bounded media job', {
      jobId: job.id,
      imageId: job.image_id,
      attempts: job.attempts,
    })
  } catch (error) {
    if (isCloudflareTransformQuotaError(error)) {
      await transitionMediaJob(env, 'fail_media_job', job, error)
      console.error('Failed bounded media job permanently', {
        jobId: job.id,
        imageId: job.image_id,
        error: stringifyError(error),
      })
      return
    }

    await transitionMediaJob(env, 'retry_media_job', job, error)
    console.warn('Requeued bounded media job', {
      jobId: job.id,
      imageId: job.image_id,
      error: stringifyError(error),
    })
  }
}

export async function drainMediaOutboxBounded(
  env: Env,
  workerName: string,
  limit = MEDIA_DRAIN_LIMIT,
): Promise<number> {
  const drainLimit = Math.min(Math.max(0, limit), MEDIA_DRAIN_LIMIT)
  let processed = 0

  for (let index = 0; index < drainLimit; index += 1) {
    const job = await claimMediaJob(env, workerName)
    if (!job) break
    await processClaimedMediaJob(job, env)
    processed += 1
  }

  console.log('Completed bounded media drain', { workerName, limit: drainLimit, processed })
  return processed
}

async function enqueueContinuation(env: Env, continuation: DrainContinuation) {
  await env.MEDIA_QUEUE.send(continuation)
}

async function runMediaDrain(env: Env, workerName: string) {
  const processed = await drainMediaOutboxBounded(env, workerName)
  if (processed === MEDIA_DRAIN_LIMIT) {
    await enqueueContinuation(env, { kind: 'drain-media' })
  }
  return processed
}

async function runDeletionDrain(env: Env, workerName: string) {
  const processed = await drainMediaDeletionOutbox(env, workerName, DELETION_DRAIN_LIMIT)
  if (processed === DELETION_DRAIN_LIMIT) {
    await enqueueContinuation(env, { kind: 'drain-deletions' })
  }
  return processed
}

export default {
  fetch(request: Request, env: Env) {
    return mediaWorker.fetch(request, env)
  },

  async queue(batch: MessageBatch<unknown>, env: Env) {
    for (const message of batch.messages) {
      const continuation = readContinuation(message.body)
      if (!continuation) {
        await mediaWorker.queue({ messages: [message] }, env)
        continue
      }

      try {
        if (continuation.kind === 'drain-media') {
          await runMediaDrain(env, QUEUED_MEDIA_DRAIN_WORKER)
        } else {
          await runDeletionDrain(env, QUEUED_DELETION_DRAIN_WORKER)
        }
        message.ack()
      } catch (error) {
        console.error('Failed to process media drain continuation', {
          kind: continuation.kind,
          error: stringifyError(error),
        })
        message.retry()
      }
    }
  },

  async scheduled(_controller: unknown, env: Env) {
    try {
      await runMediaDrain(env, SCHEDULED_MEDIA_WORKER)
    } catch (error) {
      console.error('Failed bounded scheduled media drain', { error: stringifyError(error) })
    }

    try {
      await runDeletionDrain(env, SCHEDULED_DELETION_WORKER)
    } catch (error) {
      console.error('Failed bounded scheduled media deletion drain', { error: stringifyError(error) })
    }

    try {
      await pruneMediaDeletionOutbox(env)
    } catch (error) {
      console.error('Failed to prune media deletion outbox', { error: stringifyError(error) })
    }
  },
} satisfies {
  fetch(request: Request, env: Env): Promise<Response>
  queue(batch: MessageBatch<unknown>, env: Env): Promise<void>
  scheduled(controller: unknown, env: Env): Promise<void>
}
