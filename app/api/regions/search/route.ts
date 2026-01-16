import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

export const revalidate = 60

export async function GET(request: NextRequest) {
  const cookies = request.cookies
  const { searchParams } = new URL(request.url)
  const query = searchParams.get('q') || ''
  
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
    let queryBuilder = supabase
      .from('regions')
      .select('id, name, country_code, center_lat, center_lon, created_at')
      .order('name', { ascending: true })

    // Filter by search query if provided
    if (query.length >= 2) {
      queryBuilder = queryBuilder.ilike('name', `%${query}%`)
    }

    const { data, error } = await queryBuilder

    if (error) {
      console.error('Error fetching regions:', error)
      return NextResponse.json(
        { error: 'Failed to fetch regions' },
        { status: 500 }
      )
    }

    return NextResponse.json(data || [])
  } catch (error) {
    console.error('Regions search API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
