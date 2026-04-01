import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createErrorResponse } from '@/lib/errors'
import { serverEnv } from '@/lib/env'

export const revalidate = 60

export async function GET(request: NextRequest) {
  const cookies = request.cookies
  const { searchParams } = new URL(request.url)
  const query = searchParams.get('q') || ''
  
  const supabase = createServerClient(
    serverEnv.NEXT_PUBLIC_SUPABASE_URL,
    serverEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() { return cookies.getAll() },
        setAll() {},
      },
    }
  )

  try {
    let queryBuilder = supabase
      .from('climbing_areas')
      .select('id, name, country_code, center_lat, center_lon, created_at')
      .order('name', { ascending: true })

    // Filter by search query if provided
    if (query.length >= 2) {
      queryBuilder = queryBuilder.ilike('name', `%${query}%`)
    }

    const { data, error } = await queryBuilder

    if (error) {
      return createErrorResponse(error, 'Error fetching climbing areas')
    }

    return NextResponse.json(data || [])
  } catch (error) {
    return createErrorResponse(error, 'Regions search API error')
  }
}
