import { NextRequest, NextResponse } from 'next/server'
import { getServerClientFromRequest } from '@/lib/supabase-server'
import { createErrorResponse } from '@/lib/errors'

type TagKind = 'region' | 'sub_area'

export const revalidate = 30

export async function GET(request: NextRequest) {
  const supabase = getServerClientFromRequest(request)

  const { searchParams } = new URL(request.url)
  const query = searchParams.get('q')?.trim() || ''
  const kindParam = searchParams.get('kind')?.trim().toLowerCase() || 'region'
  const kind: TagKind = kindParam === 'sub_area' ? 'sub_area' : 'region'

  if (query.length < 2) {
    return NextResponse.json([], {
      headers: {
        'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=300',
      },
    })
  }

  try {
    const { data, error } = await supabase
      .from('location_tags')
      .select('id, kind, name, country_code')
      .eq('kind', kind)
      .ilike('name', `%${query}%`)
      .order('name', { ascending: true })
      .limit(20)

    if (error) {
      return createErrorResponse(error, 'Error searching location tags')
    }

    return NextResponse.json(data || [], {
      headers: {
        'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=300',
      },
    })
  } catch (error) {
    return createErrorResponse(error, 'Location tags search error')
  }
}
