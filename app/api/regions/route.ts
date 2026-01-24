import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createErrorResponse } from '@/lib/errors'
import { withCsrfProtection } from '@/lib/csrf-server'
import { rateLimit, createRateLimitResponse } from '@/lib/rate-limit'

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
      return createErrorResponse(error, 'Error fetching regions')
    }

    return NextResponse.json(data || [], {
      headers: {
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
      },
    })
  } catch (error) {
    return createErrorResponse(error, 'Regions API error')
  }
}

export async function POST(request: NextRequest) {
  const csrfResult = await withCsrfProtection(request)
  if (!csrfResult.valid) return csrfResult.response!

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

    const rateLimitResult = rateLimit(request, 'authenticatedWrite', user.id)
    const rateLimitResponse = createRateLimitResponse(rateLimitResult)
    if (!rateLimitResult.success) {
      return rateLimitResponse
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
      return createErrorResponse(checkError, 'Error checking existing region')
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
      return createErrorResponse(insertError, 'Error creating region')
    }

    return NextResponse.json(region, { status: 201 })
  } catch (error) {
    return createErrorResponse(error, 'Region create error')
  }
}
