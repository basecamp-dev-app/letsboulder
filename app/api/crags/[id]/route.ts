import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createErrorResponse } from '@/lib/errors'
import { withApiMiddleware } from '@/lib/csrf-server'
import { revalidatePath } from 'next/cache'
import { parseWithSchema } from '@/lib/api-validation'

const updateCragSchema = z.object({
  name: z.string().optional(),
  rock_type: z.string().nullable().optional(),
  region_tag: z.string().optional(),
  sub_area: z.string().nullable().optional(),
})

interface LocationTagRow {
  id: string
  name: string
  country_code: string | null
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const middlewareResult = await withApiMiddleware(request, { requireUser: false, rateLimitKey: 'authenticatedWrite' })
  if (!middlewareResult.ok) return middlewareResult.response

  const { id: cragId } = await params
  const { supabase } = middlewareResult

  try {
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    if (!cragId) {
      return NextResponse.json({ error: 'Crag ID required' }, { status: 400 })
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .single()

    if (profileError || !profile?.is_admin) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const parsedBody = parseWithSchema(updateCragSchema, await request.json())
    if (!parsedBody.success) return parsedBody.response
    const body = parsedBody.data
    const trimmedName = body.name?.trim()
    const trimmedRegionTag = body.region_tag?.trim()
    const normalizedSubArea = body.sub_area === undefined
      ? undefined
      : (body.sub_area?.trim() || null)

    const { data: existingCrag, error: fetchError } = await supabase
      .from('crags')
      .select('id, name, slug, country_code, region_name, sub_area')
      .eq('id', cragId)
      .single()

    if (fetchError || !existingCrag) {
      return NextResponse.json({ error: 'Crag not found' }, { status: 404 })
    }

    const updateData: Record<string, unknown> = {}
    if (body.name !== undefined) {
      if (!trimmedName) {
        return NextResponse.json({ error: 'Crag name cannot be empty' }, { status: 400 })
      }
      updateData.name = trimmedName
    }
    if (body.rock_type !== undefined) updateData.rock_type = body.rock_type
    if (normalizedSubArea !== undefined) updateData.sub_area = normalizedSubArea

    let primaryRegionTagId: string | null = null
    if (body.region_tag !== undefined) {
      if (!trimmedRegionTag) {
        return NextResponse.json({ error: 'Region tag cannot be empty' }, { status: 400 })
      }

      updateData.region_name = trimmedRegionTag

      const countryCode = existingCrag.country_code ? existingCrag.country_code.toUpperCase() : null
      const { data: existingTagRows, error: existingTagError } = await supabase
        .from('location_tags')
        .select('id, name, country_code')
        .eq('kind', 'region')
        .ilike('name', trimmedRegionTag)
        .limit(10)

      if (existingTagError) {
        return createErrorResponse(existingTagError, 'Error resolving region tag')
      }

      const matchedTag = ((existingTagRows || []) as LocationTagRow[]).find((tag) => {
        if (countryCode && tag.country_code && tag.country_code.toUpperCase() !== countryCode) return false
        return true
      })

      if (matchedTag?.id) {
        primaryRegionTagId = matchedTag.id
      } else {
        const slug = trimmedRegionTag
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '') || 'region'

        const { data: createdTag, error: createdTagError } = await supabase
          .from('location_tags')
          .insert({
            kind: 'region',
            name: trimmedRegionTag,
            slug,
            country_code: countryCode,
          })
          .select('id')
          .single()

        if (createdTagError || !createdTag?.id) {
          const { data: fallbackTag, error: fallbackTagError } = await supabase
            .from('location_tags')
            .select('id')
            .eq('kind', 'region')
            .ilike('name', trimmedRegionTag)
            .limit(1)
            .maybeSingle()

          if (fallbackTagError || !fallbackTag?.id) {
            return createErrorResponse(createdTagError || fallbackTagError, 'Error creating region tag')
          }

          primaryRegionTagId = fallbackTag.id
        } else {
          primaryRegionTagId = createdTag.id
        }
      }
    }

    const { data: updatedCrag, error: updateError } = await supabase
      .from('crags')
      .update(updateData)
      .eq('id', cragId)
      .select('id, name, rock_type, type, latitude, longitude, region_name, sub_area')
      .single()

    if (updateError) {
      return createErrorResponse(updateError, 'Error updating crag')
    }

    if (body.region_tag !== undefined && primaryRegionTagId) {
      const { error: deleteTagError } = await supabase
        .from('crag_location_tags')
        .delete()
        .eq('crag_id', cragId)
        .eq('is_primary_region', true)

      if (deleteTagError) {
        return createErrorResponse(deleteTagError, 'Error clearing existing primary region tag')
      }

      const { error: insertTagError } = await supabase
        .from('crag_location_tags')
        .upsert({
          crag_id: cragId,
          tag_id: primaryRegionTagId,
          is_primary_region: true,
        }, { onConflict: 'crag_id,tag_id' })

      if (insertTagError) {
        return createErrorResponse(insertTagError, 'Error updating primary region tag')
      }
    }

    await supabase.from('admin_actions').insert({
      user_id: user.id,
      action: 'rename_crag',
      target_id: cragId,
      details: {
        previous_name: existingCrag.name,
        new_name: body.name,
        rock_type: body.rock_type,
        previous_region_tag: existingCrag.region_name,
        new_region_tag: body.region_tag,
        previous_sub_area: existingCrag.sub_area,
        new_sub_area: normalizedSubArea
      }
    })

    revalidatePath('/')
    if (existingCrag?.slug && existingCrag?.country_code) {
      revalidatePath(`/${existingCrag.country_code.toLowerCase()}/${existingCrag.slug}`)
    }

    return NextResponse.json({
      success: true,
      crag: updatedCrag,
      message: `Crag updated: "${existingCrag.name}"`
    })
  } catch (error) {
    return createErrorResponse(error, 'Error updating crag')
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const middlewareResult = await withApiMiddleware(request, { requireUser: false, rateLimitKey: 'sensitive' })
  if (!middlewareResult.ok) return middlewareResult.response

  const { id: cragId } = await params
  const { supabase } = middlewareResult

  try {
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    if (!cragId) {
      return NextResponse.json({ error: 'Crag ID required' }, { status: 400 })
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .single()

    if (profileError || !profile?.is_admin) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const { data: crag, error: fetchError } = await supabase
      .from('crags')
      .select('id, name, slug, country_code')
      .eq('id', cragId)
      .single()

    if (fetchError || !crag) {
      return NextResponse.json({ error: 'Crag not found' }, { status: 404 })
    }

    const { data: climbData } = await supabase
      .from('climbs')
      .select('id')
      .eq('crag_id', cragId)

    const { data: imageData } = await supabase
      .from('images')
      .select('id')
      .eq('crag_id', cragId)

    const climbCount = climbData?.length || 0
    const imageCount = imageData?.length || 0

    const { error: deleteError } = await supabase
      .from('crags')
      .delete()
      .eq('id', cragId)

    if (deleteError) {
      return createErrorResponse(deleteError, 'Error deleting crag')
    }

    await supabase.from('admin_actions').insert({
      user_id: user.id,
      action: 'delete_crag',
      target_id: cragId,
      details: {
        crag_name: crag.name,
        climbs_deleted: climbCount,
        images_deleted: imageCount
      }
    })

    revalidatePath('/')
    if (crag?.slug && crag?.country_code) {
      revalidatePath(`/${crag.country_code.toLowerCase()}/${crag.slug}`)
    }

    return NextResponse.json({
      success: true,
      message: `Crag "${crag.name}" deleted with ${climbCount} climbs and ${imageCount} images`
    })
  } catch (error) {
    return createErrorResponse(error, 'Error deleting crag')
  }
}
