import { NextResponse } from 'next/server'
import type { SubmissionRouteMutationDeps } from '@/features/submissions/server/submissions/route-line-shared'

export async function deleteSubmissionRoute(
  deps: SubmissionRouteMutationDeps,
  body: unknown
) {
  void deps
  void body
  return NextResponse.json({ error: 'Community wiki editing is additive only. Deleting published routes is disabled.' }, { status: 403 })
}
