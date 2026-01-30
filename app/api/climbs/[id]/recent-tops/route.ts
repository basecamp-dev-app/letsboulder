import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createErrorResponse } from '@/lib/errors'

interface RecentTopLogRow {
  user_id: string
  style: 'top' | 'flash'
  created_at: string
}

interface ProfileRow {
  id: string
  username: string | null
  display_name: string | null
  first_name: string | null
  last_name: string | null
  avatar_url: string | null
  is_public: boolean
}

function getDisplayName(profile: ProfileRow): string {
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
      .select('user_id, style, created_at')
      .eq('climb_id', climbId)
      .in('style', ['top', 'flash'])
      .gte('created_at', sixtyDaysAgo)
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) {
      return createErrorResponse(error, 'Recent tops error')
    }

    const rows = (data as unknown as RecentTopLogRow[] | null) || []

    const userIds = Array.from(new Set(rows.map((r) => r.user_id)))
    if (userIds.length === 0) {
      return NextResponse.json(
        {
          climb_id: climbId,
          recent_tops: [],
        },
        {
          headers: {
            'Cache-Control': 'private, no-store',
          },
        }
      )
    }

    const { data: profiles, error: profileError } = await supabase
      .from('profiles')
      .select('id, username, display_name, first_name, last_name, avatar_url, is_public')
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
          'Cache-Control': 'private, no-store',
        },
      }
    )
  } catch (error) {
    return createErrorResponse(error, 'Recent tops error')
  }
}
