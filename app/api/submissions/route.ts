import { NextRequest } from 'next/server'
import { withApiMiddleware } from '@/lib/csrf-server'
import { getSubmissionInfo } from '@/features/submissions/server/submissions/submit-route-info'
import { submitRoute } from '@/features/submissions/server/submissions/submit-route'

export async function POST(request: NextRequest) {
  const middlewareResult = await withApiMiddleware(request, { requireUser: false, rateLimitKey: 'submissions' })
  if (!middlewareResult.ok) return middlewareResult.response

  return submitRoute(request)
}

export async function GET() {
  return getSubmissionInfo()
}
