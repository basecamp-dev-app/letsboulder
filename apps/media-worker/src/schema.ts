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
  last_error: string | null
  created_at: string
  updated_at: string
}
