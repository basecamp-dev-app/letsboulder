import { NextRequest, NextResponse } from 'next/server'
import { getUnauthenticatedClient } from '@/lib/supabase-server'
import { createErrorResponse } from '@/lib/errors'
import { resolveEffectiveClimbId } from '@/features/climb/lib/effective-climb'
import type { Database } from '@/types/database'
import { getDisplayName, type ProfileRow } from '@/lib/profile-helpers'

type RecentTopLogRow = Pick<Database['public']['Tables']['user_climbs']['Row'], 'user_id' | 'style' | 'created_at'>
const PUBLIC_CACHE_CONTROL = 'public, s-maxage=60, stale-while-revalidate=300'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = getUnauthenticatedClient()

  try {
    const { id: climbId } = await params
    const effectiveClimbId = await resolveEffectiveClimbId(supabase as never, climbId)

    if (!effectiveClimbId) {
      return NextResponse.json({ error: 'Climb not found' }, { status: 404 })
    }

    const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString()

    const { data, error } = await supabase
      .from('user_climbs')
      .select('user_id, style, created_at')
      .eq('climb_id', effectiveClimbId)
      .in('style', ['top', 'flash'])
      .gte('created_at', sixtyDaysAgo)
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) {
      return createErrorResponse(error, 'Recent tops error')
    }

    const rows = (data as RecentTopLogRow[] | null) || []

    const userIds = Array.from(new Set(rows.map((r) => r.user_id)))
    if (userIds.length === 0) {
      return NextResponse.json(
        {
          climb_id: climbId,
          recent_tops: [],
        },
        {
          headers: {
            'Cache-Control': PUBLIC_CACHE_CONTROL,
          },
        }
      )
    }

    const { data: profiles, error: profileError } = await supabase
      .from('profiles')
      .select('id, username, display_name, avatar_url, is_public')
      .in('id', userIds)
      .eq('is_public', true)

    if (profileError) {
      return createErrorResponse(profileError, 'Recent tops error')
    }

    const profileMap = new Map(((profiles as ProfileRow[] | null) || []).map((p) => [p.id, p]))

    return NextResponse.json(
      {
        climb_id: climbId,
        recent_tops: rows
          .map((r) => {
            const profile = profileMap.get(r.user_id)
            if (!profile) return null
            return {
              user_id: r.user_id,
              style: r.style,
              created_at: r.created_at,
              profile: {
                id: profile.id,
                username: profile.username,
                display_name: getDisplayName(profile),
                avatar_url: profile.avatar_url,
              },
            }
          })
          .filter((r): r is NonNullable<typeof r> => r != null),
      },
      {
        headers: {
          'Cache-Control': PUBLIC_CACHE_CONTROL,
        },
      }
    )
  } catch (error) {
    return createErrorResponse(error, 'Recent tops error')
  }
}
