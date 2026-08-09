import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { parseWithSchema } from '@/lib/api-validation'
import { withApiMiddleware } from '@/lib/csrf-server'

const diagnosticSchema = z.object({
  fileName: z.string().max(255),
  mimeType: z.string().max(100),
  size: z.number().int().nonnegative().max(20 * 1024 * 1024),
  width: z.number().int().nonnegative().max(20_000).nullable(),
  height: z.number().int().nonnegative().max(20_000).nullable(),
  userAgent: z.string().max(1_000),
  arrayBuffer: z.object({
    success: z.boolean(),
    byteLength: z.number().int().nonnegative().max(20 * 1024 * 1024).nullable(),
  }),
  stages: z.array(z.object({
    name: z.string().max(100),
    durationMs: z.number().nonnegative().max(120_000),
    outcome: z.enum(['success', 'empty', 'error']),
    error: z.object({
      name: z.string().max(100),
      message: z.string().max(500),
    }).optional(),
  })).max(20),
  source: z.enum(['buffer', 'Blob', 'fallback', 'none']),
}).strict()

export async function POST(request: NextRequest) {
  if (process.env.DEBUG_IMAGE_GPS_REPORTING !== 'true') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const middlewareResult = await withApiMiddleware(request, {
    rateLimitKey: 'imageGpsDiagnostic',
  })
  if (!middlewareResult.ok) return middlewareResult.response

  const parsedBody = parseWithSchema(diagnosticSchema, await request.json().catch(() => null))
  if (!parsedBody.success) return parsedBody.response

  // This payload intentionally excludes GPS values, image bytes, and EXIF contents.
  // eslint-disable-next-line no-console
  console.info('[image-gps-diagnostic]', JSON.stringify(parsedBody.data))
  return NextResponse.json({ ok: true })
}
