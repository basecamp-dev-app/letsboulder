import { NextRequest, NextResponse } from 'next/server'
import { loadImageFaces } from '@/features/crags/server'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: requestedImageId } = await params
  if (!requestedImageId) {
    return NextResponse.json({ error: 'Image ID is required' }, { status: 400 })
  }

  return loadImageFaces(requestedImageId)
}
