import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

export const dynamic = 'force-static'
export const revalidate = 3600

export async function GET(request: NextRequest) {
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
    const { data, error } = await supabase
      .from('regions')
      .select('id, name, country_code, center_lat, center_lon, created_at')
      .order('name', { ascending: true })

    if (error) {
      console.error('Error fetching regions:', error)
      return NextResponse.json(
        { error: 'Failed to fetch regions' },
        { status: 500 }
      )
    }

    return NextResponse.json(data || [], {
      headers: {
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
      },
    })
  } catch (error) {
    console.error('Regions API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
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
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { name, country_code } = body

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json(
        { error: 'Region name is required' },
        { status: 400 }
      )
    }

    const trimmedName = name.trim()

    const { data: existing, error: checkError } = await supabase
      .from('regions')
      .select('id, name')
      .ilike('name', trimmedName)
      .limit(1)

    if (checkError) {
      console.error('Error checking existing region:', checkError)
      return NextResponse.json(
        { error: 'Failed to check for existing region' },
        { status: 500 }
      )
    }

    if (existing && existing.length > 0) {
      return NextResponse.json(
        { 
          error: `Region "${trimmedName}" already exists`,
          existingId: existing[0].id,
          existingName: existing[0].name,
          code: 'DUPLICATE'
        },
        { status: 409 }
      )
    }

    const { data: region, error: insertError } = await supabase
      .from('regions')
      .insert({
        name: trimmedName,
        country_code: country_code?.toUpperCase().slice(0, 2) || null
      })
      .select('id, name, country_code, center_lat, center_lon, created_at')
      .single()

    if (insertError) {
      console.error('Error creating region:', insertError)
      return NextResponse.json(
        { error: 'Failed to create region' },
        { status: 500 }
      )
    }

    return NextResponse.json(region, { status: 201 })
  } catch (error) {
    console.error('Region create error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
