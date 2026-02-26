import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createErrorResponse } from '@/lib/errors'
import { withCsrfProtection } from '@/lib/csrf-server'

const VALID_ACTIONS = ['keep', 'edit', 'remove']

interface FlagWithRelations {
  id: string
  status: string
  crag_id: string | null
  climb_id: string | null
  image_id: string | null
  flagger_id: string | null
  flag_type: string
  comment: string
  climb: { id: string; name: string } | null
  image: { id: string; url: string } | null
  crag: { id: string; name: string } | null
  created_at: string
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const csrfResult = await withCsrfProtection(request)
  if (!csrfResult.valid) return csrfResult.response!

  const cookies = request.cookies
  const { id: flagId } = await params

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookies.getAll() },
        setAll() {},
      },
    }
  )

  try {
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    if (!flagId) {
      return NextResponse.json({ error: 'Flag ID required' }, { status: 400 })
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .single()

    if (profileError || !profile?.is_admin) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const body = await request.json()
    const { action, resolution_note } = body

    if (!action || !VALID_ACTIONS.includes(action)) {
      return NextResponse.json({ error: `Invalid action. Must be one of: ${VALID_ACTIONS.join(', ')}` }, { status: 400 })
    }

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

    if (flagError || !flag) {
      return NextResponse.json({ error: 'Flag not found' }, { status: 404 })
    }

    const typedFlag = flag as unknown as FlagWithRelations

    if (typedFlag.status === 'resolved') {
      return NextResponse.json({ error: 'This flag has already been resolved' }, { status: 400 })
    }

    const resolvedAt = new Date().toISOString()

    if (action === 'remove') {
      if (typedFlag.crag_id && !typedFlag.climb_id && !typedFlag.image_id) {
        const { error: climbFetchError } = await supabase
          .from('climbs')
          .select('id')
          .eq('crag_id', typedFlag.crag_id)

        if (climbFetchError) {
          return createErrorResponse(climbFetchError, 'Error fetching climbs for deletion')
        }

        const { error: deleteCragError } = await supabase
          .from('crags')
          .delete()
          .eq('id', typedFlag.crag_id)

        if (deleteCragError) {
          return createErrorResponse(deleteCragError, 'Error deleting crag')
        }
      }

      if (typedFlag.climb_id) {
        const { error: deleteError } = await supabase
          .from('climbs')
          .delete()
          .eq('id', typedFlag.climb_id)

        if (deleteError) {
          return createErrorResponse(deleteError, 'Error removing climb')
        }
      }

      if (typedFlag.image_id) {
        const { error: deleteError } = await supabase
          .from('images')
          .delete()
          .eq('id', typedFlag.image_id)

        if (deleteError) {
          return createErrorResponse(deleteError, 'Error removing image')
        }
      }
    }

    const { error: updateError } = await supabase
      .from('climb_flags')
      .update({
        status: 'resolved',
        action_taken: action,
        resolved_by: user.id,
        resolved_at: resolvedAt,
      })
      .eq('id', flagId)

    if (updateError) {
      return createErrorResponse(updateError, 'Error resolving flag')
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
        link = `/crags`
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

      await supabase.from('notifications').insert({
        user_id: typedFlag.flagger_id,
        type: 'flag_resolved',
        title,
        message: resolution_note ? `${message}\n\nNote: ${resolution_note}` : message,
        link,
      })
    }

    return NextResponse.json({
      success: true,
      flag: {
        id: typedFlag.id,
        status: 'resolved',
        action_taken: action,
        resolved_by: user.id,
        resolved_at: resolvedAt,
      },
      message: `Flag resolved with action: ${action}`,
    })
  } catch (error) {
    return createErrorResponse(error, 'Flag resolution error')
  }
}
