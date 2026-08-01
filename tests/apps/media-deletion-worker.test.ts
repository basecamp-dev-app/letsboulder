import { beforeEach, describe, expect, it, vi } from 'vitest'

const { rpc } = vi.hoisted(() => ({
  rpc: vi.fn(async (): Promise<{ data: unknown; error: Error | null }> => ({ data: null, error: null })),
}))

vi.mock('@/apps/media-worker/src/supabase', () => ({
  createSupabaseAdminClient: () => ({ rpc }),
}))

import { drainMediaDeletionOutbox, processMediaDeletionJob } from '@/apps/media-worker/src/deletion-outbox'
import type { MediaDeletionJobRow } from '@/apps/media-worker/src/schema'

const job: MediaDeletionJobRow = {
  id: '10000000-0000-4000-8000-000000000001',
  bucket: 'private-media',
  object_key: 'images/assets/10000000-0000-4000-8000-000000000002/original.jpg',
  reason: 'account_deleted',
  source_type: 'image',
  source_id: '10000000-0000-4000-8000-000000000002',
  image_id: '10000000-0000-4000-8000-000000000002',
  delivery_verified_at: null,
  status: 'processing',
  attempts: 1,
  max_attempts: 8,
  claim_token: '10000000-0000-4000-8000-000000000003',
}

function createEnv(deleteObject = vi.fn(async () => undefined), privateBucket = 'private-media') {
  return {
    R2_PRIVATE_BUCKET: privateBucket,
    ORIGINALS_BUCKET: { delete: deleteObject },
  } as never
}

describe('media deletion worker', () => {
  beforeEach(() => {
    rpc.mockReset()
    rpc.mockResolvedValue({ data: null, error: null })
  })

  it('deletes from the allowlisted private binding and completes the claim', async () => {
    const deleteObject = vi.fn(async () => undefined)
    await processMediaDeletionJob(job, createEnv(deleteObject))

    expect(deleteObject).toHaveBeenCalledWith(job.object_key)
    expect(rpc).toHaveBeenCalledWith('complete_media_deletion_job', {
      p_job_id: job.id,
      p_claim_token: job.claim_token,
    })
  })

  it('fails an unknown bucket without touching R2', async () => {
    const deleteObject = vi.fn(async () => undefined)
    await processMediaDeletionJob(job, createEnv(deleteObject, 'different-private-bucket'))

    expect(deleteObject).not.toHaveBeenCalled()
    expect(rpc).toHaveBeenCalledWith('fail_media_deletion_job', {
      p_job_id: job.id,
      p_claim_token: job.claim_token,
      p_error: 'Deletion bucket is not allowlisted',
    })
  })

  it('requeues transient R2 failures through the claim-safe RPC', async () => {
    const deleteObject = vi.fn(async () => {
      throw new Error('R2 unavailable')
    })
    await processMediaDeletionJob(job, createEnv(deleteObject))

    expect(rpc).toHaveBeenCalledWith('retry_media_deletion_job', {
      p_job_id: job.id,
      p_claim_token: job.claim_token,
      p_error: 'R2 unavailable',
    })
  })

  it('treats an all-null composite claim as an empty outbox', async () => {
    rpc.mockResolvedValueOnce({ data: { id: null, claim_token: null }, error: null })

    await expect(drainMediaDeletionOutbox(createEnv())).resolves.toBe(0)
  })
})
