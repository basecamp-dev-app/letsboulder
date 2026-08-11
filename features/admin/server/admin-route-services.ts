import { NextResponse } from 'next/server'
import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createErrorResponse } from '@/lib/errors'
import { parseWithSchema } from '@/lib/api-validation'
import { QueueItemSchema, QueueItemVoteSchema, FlagWithRelationsSchema } from '@/lib/supabase-result-schemas'
import { calculateVoteCounts } from '../lib/vote-utils'
import { revalidatePublicCrag, revalidatePublicCragSlug } from '@/features/crags/public-server'

import type { NextRequest } from 'next/server'

type RequestSupabaseClient = ReturnType<typeof import('@/lib/supabase-server').getServerClientFromRequest>
type ContentTargetType = 'crag' | 'climb' | 'image'

export const moderationQueueVoteSchema = z.object({
  vote_type: z.enum(['verify', 'flag']),
  reason: z.string().optional(),
})

export const flagResolveSchema = z.object({
  action: z.enum(['keep', 'edit', 'remove']),
  resolution_note: z.string().optional(),
})

export const moveImageCragSchema = z.object({
  targetCragId: z.string().trim().min(1, 'Target crag is required'),
})

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
  if (!crag) return
  revalidatePublicCrag(crag.id)
  if (!crag.slug || !crag.country_code) return
  revalidatePublicCragSlug(crag.country_code, crag.slug)
  revalidatePath(`/${crag.country_code.toLowerCase()}/${crag.slug}`)
}

export async function listFlags(supabase: RequestSupabaseClient, status: string, limit: number, offset: number) {
  try {
    let query = supabase
      .from('climb_flags')
      .select(`
        id,
        flag_type,
        comment,
        status,
        action_taken,
        resolved_by,
        resolved_at,
        created_at,
        flagger_id,
        image_id,
        crag_id,
        climb_id,
        images(id, url),
        crags(id, name),
        climbs(id, name, grade)
      `)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (status !== 'all') query = query.eq('status', status)

    const { data: flags, error } = await query
    if (error) return createErrorResponse(error, 'Error fetching flags')

    const flaggerIds = [...new Set((flags || []).map((flag) => flag.flagger_id).filter(Boolean))]
    const { data: flaggerProfiles } = flaggerIds.length > 0
      ? await supabase.from('profiles').select('id, username').in('id', flaggerIds)
      : { data: [] }

    const profileMap = new Map((flaggerProfiles || []).map((profile) => [profile.id, profile]))
    const flagsWithRelations = (flags || []).map((flag) => ({
      ...flag,
      image: flag.images ?? null,
      crag: flag.crags ?? null,
      climbs: flag.climbs ?? null,
      flagger: flag.flagger_id ? profileMap.get(flag.flagger_id) ?? null : null,
    }))

    let countQuery = supabase.from('climb_flags').select('*', { count: 'exact', head: true })
    if (status !== 'all') countQuery = countQuery.eq('status', status)
    const { count } = await countQuery

    return NextResponse.json({ flags: flagsWithRelations, count: count || 0 })
  } catch (error) {
    return createErrorResponse(error, 'Flags fetch error')
  }
}

export async function resolveFlag(request: NextRequest, supabase: RequestSupabaseClient, userId: string, flagId: string) {
  try {
    const parsedBody = parseWithSchema(flagResolveSchema, await request.json())
    if (!parsedBody.success) return parsedBody.response
    const { action, resolution_note } = parsedBody.data

    const { data: flag, error: flagError } = await supabase
      .from('climb_flags')
      .select(`
        id,
        status,
        crag_id,
        climb_id,
        image_id,
        flagger_id,
        flag_type,
        comment,
        climb:climb_id(id, name),
        image:image_id(id, url),
        crag:crag_id(id, name)
      `)
      .eq('id', flagId)
      .single()

    if (flagError || !flag) return NextResponse.json({ error: 'Flag not found' }, { status: 404 })

    const typedFlag = FlagWithRelationsSchema.parse(flag)
    if (typedFlag.status === 'resolved') {
      return NextResponse.json({ error: 'This flag has already been resolved' }, { status: 400 })
    }

    const { data: affectedCrag } = typedFlag.crag_id
      ? await supabase.from('crags').select('id, slug, country_code').eq('id', typedFlag.crag_id).maybeSingle()
      : { data: null }

    const resolvedAt = new Date().toISOString()

    if (action === 'remove') {
      const deletionReason = resolution_note?.trim() || `Moderation flag: ${typedFlag.flag_type}`
      const target: { id: string; type: ContentTargetType } | null = typedFlag.climb_id
        ? { id: typedFlag.climb_id, type: 'climb' }
        : typedFlag.image_id
          ? { id: typedFlag.image_id, type: 'image' }
          : typedFlag.crag_id
            ? { id: typedFlag.crag_id, type: 'crag' }
            : null

      if (target) {
        const { error: moderationError } = await supabase.rpc('resolve_and_soft_delete_content', {
          p_target_id: target.id,
          p_target_type: target.type,
          p_reason: deletionReason,
          p_action_taken: action,
        })
        if (moderationError) return createErrorResponse(moderationError, 'Error resolving moderation action')
      }
    } else {
      const { error: updateError } = await supabase
        .from('climb_flags')
        .update({ status: 'resolved', action_taken: action, resolved_by: userId, resolved_at: new Date().toISOString() })
        .eq('id', flagId)

      if (updateError) return createErrorResponse(updateError, 'Error resolving flag')
    }

    if (action === 'remove' && typedFlag.crag_id) {
      revalidatePublicCrag(typedFlag.crag_id)
      if (affectedCrag?.slug && affectedCrag.country_code) {
        revalidatePublicCragSlug(affectedCrag.country_code, affectedCrag.slug)
        revalidatePath(`/${affectedCrag.country_code.toLowerCase()}/${affectedCrag.slug}`)
      }
    }

    const climbName = typedFlag.climb?.name || 'Unnamed route'
    const cragName = typedFlag.crag?.name || 'Unknown crag'
    const isImageFlag = !!typedFlag.image_id
    const isCragOnlyFlag = !typedFlag.climb_id && !typedFlag.image_id && !!typedFlag.crag_id

    if (typedFlag.flagger_id) {
      let title = ''
      let message = ''
      let link = ''

      if (isCragOnlyFlag) {
        switch (action) {
          case 'keep':
            title = 'Flag dismissed'
            message = `Your flag for crag "${cragName}" was reviewed and no action was taken.`
            break
          case 'remove':
            title = 'Flag resolved - crag removed'
            message = `Your flag for crag "${cragName}" was resolved by removing the crag and all associated climbs and images.`
            break
        }
        link = '/crags'
      } else if (isImageFlag) {
        switch (action) {
          case 'keep':
            title = 'Flag dismissed'
            message = `Your flag for an image at ${cragName} was reviewed and no action was taken.`
            break
          case 'edit':
            title = 'Flag resolved - image updated'
            message = `Your flag for an image at ${cragName} was resolved by updating the image.`
            break
          case 'remove':
            title = 'Flag resolved - image removed'
            message = `Your flag for an image at ${cragName} was resolved by removing the image.`
            break
        }
        link = `/image/${typedFlag.image_id}`
      } else {
        switch (action) {
          case 'keep':
            title = 'Flag dismissed'
            message = `Your flag for "${climbName}" at ${cragName} was reviewed and the climb was kept.`
            break
          case 'edit':
            title = 'Flag resolved - climb edited'
            message = `Your flag for "${climbName}" at ${cragName} was resolved by editing the climb.`
            break
          case 'remove':
            title = 'Flag resolved - climb removed'
            message = `Your flag for "${climbName}" at ${cragName} was resolved by removing the climb.`
            break
        }
        link = typedFlag.climb_id ? `/climbs/${typedFlag.climb_id}` : `/crag/${typedFlag.crag?.id}`
      }

      await supabase.rpc('create_notification', {
        p_target_user_id: typedFlag.flagger_id,
        p_type: 'flag_resolved',
        p_title: title,
        p_message: resolution_note ? `${message}\n\nNote: ${resolution_note}` : message,
        p_link: link,
      })
    }

    return NextResponse.json({
      success: true,
      flag: {
        id: typedFlag.id,
        status: 'resolved',
        action_taken: action,
        resolved_by: userId,
        resolved_at: resolvedAt,
      },
      message: `Flag resolved with action: ${action}`,
    })
  } catch (error) {
    return createErrorResponse(error, 'Flag resolution error')
  }
}

export async function listModerationQueue(supabase: RequestSupabaseClient, status: string, cragId: string | null) {
  try {
    let query = supabase
      .from('moderation_queue')
      .select(`
        id,
        status,
        verify_count,
        flag_count,
        quality_score,
        created_at,
        resolved_at,
        climb:climb_id(id, name, grade, description, image_url),
        crag:crag_id(id, name),
        submitter:submitter_id(id, username)
      `)
      .eq('status', status)
      .order('created_at', { ascending: false })

    if (cragId) query = query.eq('crag_id', cragId)

    const { data: rawData, error } = await query
    if (error) return createErrorResponse(error, 'Error fetching moderation queue')

    const queue = z.array(QueueItemSchema).parse(rawData || [])
    return NextResponse.json({ queue, count: queue.length })
  } catch (error) {
    return createErrorResponse(error, 'Queue fetch error')
  }
}

export async function voteOnModerationQueueItem(request: NextRequest, supabase: RequestSupabaseClient, userId: string, queueId: string) {
  try {
    const parsedBody = parseWithSchema(moderationQueueVoteSchema, await request.json())
    if (!parsedBody.success) return parsedBody.response
    const { vote_type, reason } = parsedBody.data

    const { data: rawData, error: queueError } = await supabase
      .from('moderation_queue')
      .select(`
        id,
        status,
        crag_id,
        submitter_id,
        verify_count,
        flag_count,
        climb:climb_id(id, name, grade),
        crag:crag_id(id, name)
      `)
      .eq('id', queueId)
      .single()

    if (queueError || !rawData) return NextResponse.json({ error: 'Queue item not found' }, { status: 404 })

    const queueItem = QueueItemVoteSchema.parse(rawData)
    if (queueItem.status !== 'pending') {
      return NextResponse.json({ error: 'This submission has already been resolved' }, { status: 400 })
    }

    if (queueItem.submitter_id === userId) {
      return NextResponse.json({ error: 'You cannot vote on your own submission' }, { status: 400 })
    }

    const { data: existingVote } = await supabase
      .from('moderation_votes')
      .select('id')
      .eq('queue_id', queueId)
      .eq('voter_id', userId)
      .single()

    if (existingVote) {
      return NextResponse.json({ error: 'You have already voted on this submission' }, { status: 400 })
    }

    const { error: insertError } = await supabase.from('moderation_votes').insert({ queue_id: queueId, voter_id: userId, vote_type, reason })
    if (insertError) return createErrorResponse(insertError, 'Error recording vote')

    const { newVerifyCount, newFlagCount, wasResolved, resolutionStatus } = calculateVoteCounts(
      queueItem,
      vote_type
    )

    const climbName = queueItem.climb?.name || 'Unnamed route'
    const cragName = queueItem.crag?.name || 'Unknown crag'
    const cragId = queueItem.crag?.id || queueItem.crag_id

    if (queueItem.submitter_id !== userId) {
      await supabase.rpc('create_notification', {
        p_target_user_id: queueItem.submitter_id,
        p_type: wasResolved ? 'submission_resolved' : 'vote_recorded',
        p_title: wasResolved
          ? (resolutionStatus === 'verified' ? 'Route approved!' : 'Route flagged for removal')
          : 'New vote on your route',
        p_message: wasResolved
          ? `"${climbName}" at ${cragName} was ${resolutionStatus}`
          : `"${climbName}" at ${cragName} has ${newVerifyCount} verify and ${newFlagCount} flag votes`,
        p_link: `/crags/${cragId}`,
      })
    }

    return NextResponse.json({
      success: true,
      vote: vote_type,
      verify_count: newVerifyCount,
      flag_count: newFlagCount,
      resolved: wasResolved,
      status: resolutionStatus,
    })
  } catch (error) {
    return createErrorResponse(error, 'Vote error')
  }
}

export async function deleteImage(supabase: RequestSupabaseClient, imageId: string) {
  try {
    const { data: existingImage, error: fetchError } = await supabase.from('images').select('id, status, crag_id').eq('id', imageId).single()
    if (fetchError || !existingImage) return NextResponse.json({ error: 'Image not found' }, { status: 404 })
    if (existingImage.status === 'deleted') return NextResponse.json({ error: 'Image already deleted' }, { status: 400 })

    const { error: updateError } = await supabase.rpc('soft_delete_image', {
      p_image_id: imageId,
      p_reason: 'Removed by administrator',
    })
    if (updateError) return createErrorResponse(updateError, 'Error soft deleting image')

    return NextResponse.json({ success: true, message: 'Image deleted successfully' })
  } catch (error) {
    return createErrorResponse(error, 'Image deletion error')
  }
}

export async function movePublishedImageToCrag(request: NextRequest, supabase: RequestSupabaseClient, userId: string, imageId: string) {
  try {
    const parsedBody = parseWithSchema(moveImageCragSchema, await request.json().catch(() => null))
    if (!parsedBody.success) return parsedBody.response
    const { targetCragId } = parsedBody.data

    const { data: image, error: imageError } = await supabase.from('images').select('id, crag_id, place_id').eq('id', imageId).single<ImageRow>()
    if (imageError || !image) return NextResponse.json({ error: 'Published image not found' }, { status: 404 })
    if (!image.crag_id) return NextResponse.json({ error: 'This image is not assigned to a crag' }, { status: 400 })
    if (image.crag_id === targetCragId) return NextResponse.json({ error: 'Image is already assigned to that crag' }, { status: 400 })

    const { data: crags, error: cragsError } = await supabase.from('crags').select('id, name, slug, country_code').in('id', [image.crag_id, targetCragId])
    if (cragsError) return createErrorResponse(cragsError, 'Error loading crags')

    const sourceCrag = ((crags || []) as CragRow[]).find((crag) => crag.id === image.crag_id) || null
    const targetCrag = ((crags || []) as CragRow[]).find((crag) => crag.id === targetCragId) || null
    if (!sourceCrag || !targetCrag) return NextResponse.json({ error: 'Source or target crag not found' }, { status: 404 })

    const { data: targetPlace } = await supabase.from('places').select('id').eq('id', targetCragId).maybeSingle<{ id: string }>()
    const targetPlaceId = targetPlace?.id || null

    const { data: routeLines, error: routeLineError } = await supabase.from('route_lines').select('climb_id').eq('image_id', imageId)
    if (routeLineError) return createErrorResponse(routeLineError, 'Error loading image routes')

    const climbIds = Array.from(new Set(((routeLines || []) as RouteLineRow[])
      .map((routeLine) => routeLine.climb_id)
      .filter((climbId): climbId is string => typeof climbId === 'string' && climbId.length > 0)))

    if (climbIds.length === 0) return NextResponse.json({ error: 'This image has no associated routes to move' }, { status: 400 })

    const { data: climbs, error: climbsError } = await supabase.from('climbs').select('id, slug').in('id', climbIds)
    if (climbsError) return createErrorResponse(climbsError, 'Error loading associated climbs')

    const { data: targetCragClimbs, error: targetCragClimbsError } = await supabase.from('climbs').select('slug').eq('crag_id', targetCragId)
    if (targetCragClimbsError) return createErrorResponse(targetCragClimbsError, 'Error checking target crag climbs')

    const targetSlugs = new Set(
      (targetCragClimbs || [])
        .map((climb) => (typeof climb.slug === 'string' ? climb.slug : null))
        .filter((slug): slug is string => Boolean(slug))
    )

    const conflictingSlugs = ((climbs || []) as ClimbRow[])
      .map((climb) => climb.slug)
      .filter((slug): slug is string => typeof slug === 'string' && slug.length > 0)
      .filter((slug) => targetSlugs.has(slug))

    if (conflictingSlugs.length > 0) {
      return NextResponse.json({ error: `Target crag already has route slugs that would conflict: ${conflictingSlugs.join(', ')}` }, { status: 409 })
    }

    const { error: moveImageError } = await supabase.from('images').update({ crag_id: targetCragId, place_id: targetPlaceId, last_edited_by: userId }).eq('id', imageId)
    if (moveImageError) return createErrorResponse(moveImageError, 'Error moving published image')

    const { error: moveCragImagesError } = await supabase.from('crag_images').update({ crag_id: targetCragId }).or(`linked_image_id.eq.${imageId},source_image_id.eq.${imageId}`)
    if (moveCragImagesError) return createErrorResponse(moveCragImagesError, 'Error moving linked crag images')

    const { error: moveClimbsError } = await supabase.from('climbs').update({ crag_id: targetCragId, place_id: targetPlaceId, sector_id: null }).in('id', climbIds)
    if (moveClimbsError) return createErrorResponse(moveClimbsError, 'Error moving associated climbs')

    await supabase.from('admin_actions').insert({
      user_id: userId,
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
