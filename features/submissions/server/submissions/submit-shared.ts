import { NextResponse } from 'next/server'
import { createErrorResponse } from '@/lib/errors'

export interface AtomicSubmissionRouteResult {
  climb_id: string
  name: string
  grade: string
}

export interface UnifiedSubmissionResult {
  image_id: string
  crag_id: string
  climb_ids: string[]
  route_line_ids: string[]
  crag_image_ids: string[]
  climbs_created: number
  route_lines_created: number
  supplementary_created: number
}

export interface SubmissionExecutionResult {
  imageId: string
  cragId: string | null
  notificationClimbs: Array<{ id: string; name: string; grade: string }>
  climbsCreatedCount: number
  routeLinesCreatedCount: number
  supplementaryCreatedCount: number
  supplementaryCragImageIds: string[]
  firstClimbId?: string
  firstRouteId?: string
  cleanupUploadedBlobs?: Array<{ bucket: string; path: string }>
}

export function buildSubmissionSuccessResponse(result: SubmissionExecutionResult) {
  return NextResponse.json({
    success: true,
    climbsCreated: result.climbsCreatedCount,
    routeLinesCreated: result.routeLinesCreatedCount,
    supplementaryImagesCreated: result.supplementaryCreatedCount,
    supplementaryCragImageIds: result.supplementaryCragImageIds,
    imageId: result.imageId || undefined,
    climbId: result.firstClimbId,
    routeId: result.firstRouteId,
  })
}

export async function cleanupUploadedBlobs(
  supabase: { storage: { from: (bucket: string) => { remove: (paths: string[]) => Promise<unknown> } } },
  uploadedBlobsToCleanup: Array<{ bucket: string; path: string }>
) {
  const pathsByBucket = new Map<string, string[]>()

  for (const item of uploadedBlobsToCleanup) {
    if (!item.bucket || !item.path) continue
    const current = pathsByBucket.get(item.bucket) || []
    current.push(item.path)
    pathsByBucket.set(item.bucket, current)
  }

  for (const [bucket, paths] of pathsByBucket.entries()) {
    if (paths.length === 0) continue
    await supabase.storage.from(bucket).remove(Array.from(new Set(paths))).catch(() => {})
  }
}

export function submissionErrorResponse(error: unknown) {
  return createErrorResponse(error, 'Submission error')
}
