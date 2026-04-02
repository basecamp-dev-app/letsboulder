import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createErrorResponse } from '@/lib/errors'
import { withApiMiddleware } from '@/lib/csrf-server'

interface MoveImageCragRequest {
  targetCragId?: string
}

interface AdminProfileRow {
  is_admin: boolean | null
}

interface CragRow {
  id: string
  name: string
  slug: string | null
  country_code: string | null
}

interface ImageRow {
  id: string
  crag_id: string | null
  place_id: string | null
}

interface RouteLineRow {
  climb_id: string
}

interface ClimbRow {
  id: string
  slug: string | null
}

function revalidateCragPath(crag: CragRow | null) {
  if (!crag?.slug || !crag.country_code) return
  revalidatePath(`/${crag.country_code.toLowerCase()}/${crag.slug}`)
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ imageId: string }> }
) {
  const middlewareResult = await withApiMiddleware(request, { requireUser: false })
  if (!middlewareResult.ok) return middlewareResult.response

  const { supabase } = middlewareResult

  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .single<AdminProfileRow>()

    if (profileError || !profile?.is_admin) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const { imageId } = await params
    if (!imageId) {
      return NextResponse.json({ error: 'Image ID required' }, { status: 400 })
    }

    const body = await request.json().catch(() => null) as MoveImageCragRequest | null
    const targetCragId = body?.targetCragId?.trim()
    if (!targetCragId) {
      return NextResponse.json({ error: 'Target crag is required' }, { status: 400 })
    }

    const { data: image, error: imageError } = await supabase
      .from('images')
      .select('id, crag_id, place_id')
      .eq('id', imageId)
      .single<ImageRow>()

    if (imageError || !image) {
      return NextResponse.json({ error: 'Published image not found' }, { status: 404 })
    }

    if (!image.crag_id) {
      return NextResponse.json({ error: 'This image is not assigned to a crag' }, { status: 400 })
    }

    if (image.crag_id === targetCragId) {
      return NextResponse.json({ error: 'Image is already assigned to that crag' }, { status: 400 })
    }

    const { data: crags, error: cragsError } = await supabase
      .from('crags')
      .select('id, name, slug, country_code')
      .in('id', [image.crag_id, targetCragId])

    if (cragsError) {
      return createErrorResponse(cragsError, 'Error loading crags')
    }

    const sourceCrag = ((crags || []) as CragRow[]).find((crag) => crag.id === image.crag_id) || null
    const targetCrag = ((crags || []) as CragRow[]).find((crag) => crag.id === targetCragId) || null

    if (!sourceCrag || !targetCrag) {
      return NextResponse.json({ error: 'Source or target crag not found' }, { status: 404 })
    }

    const { data: targetPlace } = await supabase
      .from('places')
      .select('id')
      .eq('id', targetCragId)
      .maybeSingle<{ id: string }>()

    const targetPlaceId = targetPlace?.id || null

    const { data: routeLines, error: routeLineError } = await supabase
      .from('route_lines')
      .select('climb_id')
      .eq('image_id', imageId)

    if (routeLineError) {
      return createErrorResponse(routeLineError, 'Error loading image routes')
    }

    const climbIds = Array.from(new Set(((routeLines || []) as RouteLineRow[])
      .map((routeLine) => routeLine.climb_id)
      .filter((climbId): climbId is string => typeof climbId === 'string' && climbId.length > 0)))

    if (climbIds.length === 0) {
      return NextResponse.json({ error: 'This image has no associated routes to move' }, { status: 400 })
    }

    const { data: climbs, error: climbsError } = await supabase
      .from('climbs')
      .select('id, slug')
      .in('id', climbIds)

    if (climbsError) {
      return createErrorResponse(climbsError, 'Error loading associated climbs')
    }

    const { data: targetCragClimbs, error: targetCragClimbsError } = await supabase
      .from('climbs')
      .select('slug')
      .eq('crag_id', targetCragId)

    if (targetCragClimbsError) {
      return createErrorResponse(targetCragClimbsError, 'Error checking target crag climbs')
    }

    const targetSlugs = new Set(
      (targetCragClimbs || [])
        .map((climb) => (typeof climb.slug === 'string' ? climb.slug : null))
        .filter((slug): slug is string => Boolean(slug))
    )

    const sourceClimbs = (climbs || []) as ClimbRow[]
    const sourceSlugs = sourceClimbs
      .map((climb) => climb.slug)
      .filter((slug): slug is string => typeof slug === 'string' && slug.length > 0)
    const conflictingSlugs = sourceSlugs.filter((slug) => targetSlugs.has(slug))

    if (conflictingSlugs.length > 0) {
      return NextResponse.json(
        { error: `Target crag already has route slugs that would conflict: ${conflictingSlugs.join(', ')}` },
        { status: 409 }
      )
    }

    const { error: moveImageError } = await supabase
      .from('images')
      .update({
        crag_id: targetCragId,
        place_id: targetPlaceId,
        last_edited_by: user.id,
      })
      .eq('id', imageId)

    if (moveImageError) {
      return createErrorResponse(moveImageError, 'Error moving published image')
    }

    const { error: moveCragImagesError } = await supabase
      .from('crag_images')
      .update({ crag_id: targetCragId })
      .or(`linked_image_id.eq.${imageId},source_image_id.eq.${imageId}`)

    if (moveCragImagesError) {
      return createErrorResponse(moveCragImagesError, 'Error moving linked crag images')
    }

    const { error: moveClimbsError } = await supabase
      .from('climbs')
      .update({
        crag_id: targetCragId,
        place_id: targetPlaceId,
        sector_id: null,
      })
      .in('id', climbIds)

    if (moveClimbsError) {
      return createErrorResponse(moveClimbsError, 'Error moving associated climbs')
    }

    await supabase.from('admin_actions').insert({
      user_id: user.id,
      action: 'move_published_image_to_crag',
      target_id: imageId,
      target_type: 'image',
      details: {
        image_id: imageId,
        source_crag_id: sourceCrag.id,
        source_crag_name: sourceCrag.name,
        target_crag_id: targetCrag.id,
        target_crag_name: targetCrag.name,
        moved_climb_ids: climbIds,
      },
    })

    revalidatePath('/')
    revalidateCragPath(sourceCrag)
    revalidateCragPath(targetCrag)
    revalidatePath(`/crag/${sourceCrag.id}`)
    revalidatePath(`/crag/${targetCrag.id}`)

    return NextResponse.json({
      success: true,
      message: `Moved image and ${climbIds.length} associated climbs from ${sourceCrag.name} to ${targetCrag.name}`,
      sourceCragId: sourceCrag.id,
      targetCragId: targetCrag.id,
      movedClimbCount: climbIds.length,
    })
  } catch (error) {
    return createErrorResponse(error, 'Error moving published image to another crag')
  }
}
