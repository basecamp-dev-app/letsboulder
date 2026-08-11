import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { z } from 'zod'
import { withCsrfProtection } from '@/lib/csrf-server'
import { createErrorResponse } from '@/lib/errors'
import { getServerClientFromRequest } from '@/lib/supabase-server'
import { parseWithSchema } from '@/lib/api-validation'
import { loadCragImages } from '@/features/crags/server'

export const runtime = 'nodejs'

const cragImagesParamsSchema = z.object({
  id: z.string().min(1, 'id is required'),
})
const STORAGE_BUCKET = 'route-uploads'
const MAX_FILES = 8

function getFileExtension(file: File): string {
  if (file.type.startsWith('image/')) {
    const typeExt = file.type.slice('image/'.length).toLowerCase()
    if (typeExt) return typeExt
  }

  const dotIndex = file.name.lastIndexOf('.')
  if (dotIndex >= 0) {
    const ext = file.name.slice(dotIndex + 1).toLowerCase()
    if (ext) return ext
  }

  return 'jpg'
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const rawParams = await params
  const validation = parseWithSchema(cragImagesParamsSchema, rawParams)
  if (!validation.success) return validation.response

  const { id: cragId } = validation.data

  const supabase = getServerClientFromRequest(request)

  return loadCragImages(supabase, cragId)
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const csrfResult = await withCsrfProtection(request)
  if (!csrfResult.valid) return csrfResult.response!

  const { id: cragId } = await params
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll() {},
      },
    }
  )

  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const { data: existingCrag, error: cragError } = await supabase
      .from('crags')
      .select('id')
      .eq('id', cragId)
      .maybeSingle()

    if (cragError) return createErrorResponse(cragError, 'Failed to validate crag')
    if (!existingCrag) return NextResponse.json({ error: 'Crag not found' }, { status: 404 })

    const formData = await request.formData()
    const files = formData.getAll('images').filter((value): value is File => value instanceof File)
    if (files.length === 0) return NextResponse.json({ error: 'At least one image is required' }, { status: 400 })
    if (files.length > MAX_FILES) {
      return NextResponse.json({ error: `Maximum ${MAX_FILES} images allowed` }, { status: 400 })
    }

    for (const file of files) {
      if (!file.type.startsWith('image/')) {
        return NextResponse.json({ error: 'Only image files are allowed' }, { status: 400 })
      }
      if (file.size === 0) return NextResponse.json({ error: 'Empty file uploaded' }, { status: 400 })
    }

    const uploadedPaths: string[] = []
    try {
      const imageUrls: string[] = []
      for (const file of files) {
        const objectPath = `${user.id}/crags/${cragId}/${crypto.randomUUID()}.${getFileExtension(file)}`
        const { error: uploadError } = await supabase.storage.from(STORAGE_BUCKET).upload(objectPath, file, {
          contentType: file.type || 'application/octet-stream',
          upsert: false,
        })
        if (uploadError) throw uploadError
        uploadedPaths.push(objectPath)
        imageUrls.push(`private://${STORAGE_BUCKET}/${objectPath}`)
      }

      const { data: insertedRows, error: insertError } = await supabase.rpc('insert_pin_images_atomic', {
        p_crag_id: cragId,
        p_urls: imageUrls,
      })
      if (insertError) throw insertError
      return NextResponse.json({ success: true, images: insertedRows || [] }, { status: 201 })
    } catch (uploadOrInsertError) {
      if (uploadedPaths.length > 0) await supabase.storage.from(STORAGE_BUCKET).remove(uploadedPaths)
      return createErrorResponse(uploadOrInsertError, 'Failed to upload crag images')
    }
  } catch (error) {
    return createErrorResponse(error, 'Failed to process crag image upload')
  }
}
