import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createErrorResponse } from '@/lib/errors'

interface RecentTopRow {
  id: string
  user_id: string
  style: 'top' | 'flash'
  created_at: string
  profiles: {
    id: string
    username: string | null
    display_name: string | null
    first_name: string | null
    last_name: string | null
    avatar_url: string | null
    is_public: boolean
  } | null
}

function getDisplayName(profile: NonNullable<RecentTopRow['profiles']>): string {
  const fullName = `${profile.first_name || ''} ${profile.last_name || ''}`.trim()
  if (fullName) return fullName
  if (profile.display_name) return profile.display_name
  if (profile.username) return profile.username
  return `Climber ${profile.id.slice(0, 4)}`
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const cookies = request.cookies
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
    const { id: climbId } = await params
    const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString()

    const { data, error } = await supabase
      .from('user_climbs')
      .select(
        'id, user_id, style, created_at, profiles!inner(id, username, display_name, first_name, last_name, avatar_url, is_public)'
      )
      .eq('climb_id', climbId)
      .in('style', ['top', 'flash'])
      .gte('created_at', sixtyDaysAgo)
      .eq('profiles.is_public', true)
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) {
      return createErrorResponse(error, 'Recent tops error')
    }

    const rows = (data as unknown as RecentTopRow[] | null) || []

    return NextResponse.json(
      {
        climb_id: climbId,
        recent_tops: rows
          .filter((r) => r.profiles && r.profiles.is_public)
          .map((r) => ({
            user_id: r.user_id,
            style: r.style,
            created_at: r.created_at,
            profile: {
              id: r.profiles!.id,
              username: r.profiles!.username,
              display_name: getDisplayName(r.profiles!),
              avatar_url: r.profiles!.avatar_url,
            },
          })),
      },
      {
        headers: {
          'Cache-Control': 'private, no-store',
        },
      }
    )
  } catch (error) {
    return createErrorResponse(error, 'Recent tops error')
  }
}
