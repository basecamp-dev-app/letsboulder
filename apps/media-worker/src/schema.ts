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
