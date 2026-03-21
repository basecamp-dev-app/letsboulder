import { GetObjectCommand, NoSuchKey } from '@aws-sdk/client-s3'
import { createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'
import { resolveUserIdWithFallback } from '@/lib/auth-context'
import { createR2Client } from '@/lib/media/r2'

export const runtime = 'nodejs'

interface DraftAccessRow {
  user_id: string
}

async function userCanAccessDraft(
  draftId: string,
  userId: string,
  supabase: ReturnType<typeof createServerClient>
): Promise<boolean> {
  const { data: draft, error: draftError } = await supabase
    .from('submission_drafts')
    .select('id, user_id')
    .eq('id', draftId)
    .maybeSingle()

  if (draftError || !draft) {
    return false
  }

  if ((draft as DraftAccessRow).user_id === userId) {
    return true
  }

  const { data: collaboratorAccess, error: collaboratorError } = await supabase
    .from('submission_draft_collaborators')
    .select('draft_id')
    .eq('draft_id', draftId)
    .eq('user_id', userId)
    .maybeSingle()

  return !collaboratorError && !!collaboratorAccess
}

export async function GET(request: NextRequest) {
  const draftId = request.nextUrl.searchParams.get('draftId')?.trim() || ''
  const objectPath = request.nextUrl.searchParams.get('path')?.trim() || ''

  if (!draftId || !objectPath) {
    return NextResponse.json({ error: 'Missing draftId or path' }, { status: 400 })
  }

  const cookies = request.cookies
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookies.getAll()
        },
        setAll() {},
      },
    }
  )

  try {
    const { userId, authError } = await resolveUserIdWithFallback(request, supabase)
    if (authError || !userId) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const { data: imageRow, error: imageError } = await supabase
      .from('submission_draft_images')
      .select('id, draft_id, storage_bucket, storage_path')
      .eq('draft_id', draftId)
      .eq('storage_path', objectPath)
      .maybeSingle()

    if (imageError || !imageRow || !imageRow.storage_bucket || !imageRow.storage_path) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const canAccess = await userCanAccessDraft(draftId, userId, supabase)
    if (!canAccess) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const r2 = createR2Client()
    const response = await r2.send(new GetObjectCommand({
      Bucket: imageRow.storage_bucket,
      Key: imageRow.storage_path,
    }))

    if (!response.Body) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    return new NextResponse(response.Body as ReadableStream, {
      headers: {
        'Content-Type': response.ContentType || 'application/octet-stream',
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (error) {
    if (error instanceof NoSuchKey) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    console.error('Private draft media proxy error:', error)
    return NextResponse.json({ error: 'Failed to load media' }, { status: 500 })
  }
}
