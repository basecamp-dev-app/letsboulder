import { z } from 'zod'

export const mediaIngestJobSchema = z.object({
  imageId: z.string().uuid(),
  originalBucket: z.string().min(1),
  originalKey: z.string().min(1),
  storageProvider: z.enum(['supabase', 'r2']),
  purpose: z.enum(['submission_image', 'draft_image', 'crag_image']),
  triggeredByUserId: z.string().uuid(),
  trigger: z.enum(['upload', 'backfill']).optional(),
})

export type MediaIngestJobPayload = z.infer<typeof mediaIngestJobSchema>

export const mediaWakeupSchema = z.object({ imageId: z.string().uuid() })
export type MediaWakeupPayload = z.infer<typeof mediaWakeupSchema>

export interface MediaJobRow {
  id: string
  image_id: string
  job_type: 'ingest_image'
  status: 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled'
  payload: unknown
  attempts: number
  max_attempts: number
  run_at: string
  locked_at: string | null
  locked_by: string | null
  claim_token: string
  lease_expires_at: string
  last_error: string | null
  created_at: string
  updated_at: string
}

export const mediaDeletionJobSchema = z.object({
  id: z.string().uuid(),
  bucket: z.string().min(1),
  object_key: z.string().min(1),
  reason: z.enum([
    'account_deleted',
    'published_submission_deleted',
    'admin_image_deleted',
    'draft_image_deleted',
    'unassociated_upload_deleted',
    'image_hard_deleted',
    'source_replaced',
    'staging_replaced',
    'upload_finalize_failed',
    'reconciled_orphan',
  ]),
  source_type: z.enum(['image', 'draft_image']),
  source_id: z.string().uuid().nullable(),
  image_id: z.string().uuid().nullable(),
  delivery_verified_at: z.string().datetime({ offset: true }).nullable(),
  expected_object_etag: z.string().min(1).nullable(),
  expected_object_bytes: z.number().int().positive().nullable(),
  reconciliation_run_id: z.number().int().positive().nullable(),
  reconciliation_artifact_digest: z.string().regex(/^sha256:[0-9a-f]{64}$/).nullable(),
  status: z.literal('processing'),
  attempts: z.number().int().nonnegative(),
  max_attempts: z.number().int().positive(),
  claim_token: z.string().uuid(),
})

export type MediaDeletionJobRow = z.infer<typeof mediaDeletionJobSchema>
