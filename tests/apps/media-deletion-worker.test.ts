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
  expected_object_etag: null,
  expected_object_bytes: null,
  reconciliation_run_id: null,
  reconciliation_artifact_digest: null,
  status: 'processing',
  attempts: 1,
  max_attempts: 8,
  claim_token: '10000000-0000-4000-8000-000000000003',
}

function createEnv(deleteObject = vi.fn(async () => undefined), privateBucket = 'private-media') {
  return {
    R2_PRIVATE_BUCKET: privateBucket,
    ORIGINALS_BUCKET: {
      delete: deleteObject,
      head: vi.fn(async () => ({ etag: 'reviewed-etag', size: 123 })),
    },
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

  it('deletes a reconciled orphan only when its source and image namespaces agree', async () => {
    const deleteObject = vi.fn(async () => undefined)
    const orphan = {
      ...job,
      object_key: `images/originals/${job.image_id}/original.jpg`,
      reason: 'reconciled_orphan' as const,
      expected_object_etag: 'reviewed-etag',
      expected_object_bytes: 123,
      reconciliation_run_id: 123,
      reconciliation_artifact_digest: `sha256:${'a'.repeat(64)}`,
    }

    await processMediaDeletionJob(orphan, createEnv(deleteObject))

    expect(deleteObject).toHaveBeenCalledWith(orphan.object_key)
    expect(rpc).toHaveBeenCalledWith('complete_media_deletion_job', {
      p_job_id: orphan.id,
      p_claim_token: orphan.claim_token,
    })
  })

  it('fails inconsistent reconciled orphan metadata without touching R2', async () => {
    const deleteObject = vi.fn(async () => undefined)
    const orphan = {
      ...job,
      object_key: `images/originals/${job.image_id}/original.jpg`,
      reason: 'reconciled_orphan' as const,
      source_id: '10000000-0000-4000-8000-000000000099',
    }

    await processMediaDeletionJob(orphan, createEnv(deleteObject))

    expect(deleteObject).not.toHaveBeenCalled()
    expect(rpc).toHaveBeenCalledWith('fail_media_deletion_job', {
      p_job_id: orphan.id,
      p_claim_token: orphan.claim_token,
      p_error: 'Reconciled orphan deletion metadata is inconsistent',
    })
  })

  it('rejects a reconciled orphan outside the originals namespace', async () => {
    const deleteObject = vi.fn(async () => undefined)
    const orphan = {
      ...job,
      object_key: `images/assets/${job.image_id}/canonical.webp`,
      reason: 'reconciled_orphan' as const,
      expected_object_etag: 'reviewed-etag',
      expected_object_bytes: 123,
      reconciliation_run_id: 123,
      reconciliation_artifact_digest: `sha256:${'a'.repeat(64)}`,
    }

    await processMediaDeletionJob(orphan, createEnv(deleteObject))

    expect(deleteObject).not.toHaveBeenCalled()
    expect(rpc).toHaveBeenCalledWith('fail_media_deletion_job', {
      p_job_id: orphan.id,
      p_claim_token: orphan.claim_token,
      p_error: 'Reconciled orphan key is not an original namespaced to the image',
    })
  })

  it('treats an all-null composite claim as an empty outbox', async () => {
    rpc.mockResolvedValueOnce({ data: { id: null, claim_token: null }, error: null })

    await expect(drainMediaDeletionOutbox(createEnv())).resolves.toBe(0)
  })

  it('hard-caps each drain at 25 jobs', async () => {
    rpc.mockResolvedValue({ data: job, error: null })

    await expect(drainMediaDeletionOutbox(createEnv(), 'test-worker', 100)).resolves.toBe(25)
    expect(rpc).toHaveBeenCalledTimes(50)
  })
})
