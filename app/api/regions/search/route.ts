import { NextRequest, NextResponse } from 'next/server'
import { getServerClientFromRequest } from '@/lib/supabase-server'
import { createErrorResponse } from '@/lib/errors'

export const revalidate = 60

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const query = searchParams.get('q')?.trim() || ''

  if (query.length < 2) {
    return NextResponse.json([])
  }
  
  const supabase = getServerClientFromRequest(request)

  try {
    const { data, error } = await supabase
      .from('location_tags')
      .select('id, name, country_code, created_at')
      .eq('kind', 'region')
      .order('name', { ascending: true })
      .ilike('name', `%${query}%`)
      .limit(20)

    if (error) {
      return createErrorResponse(error, 'Error fetching climbing areas')
    }

    return NextResponse.json((data || []).map((tag) => ({
      ...tag,
      center_lat: null,
      center_lon: null,
    })))
  } catch (error) {
    return createErrorResponse(error, 'Regions search API error')
  }
}
