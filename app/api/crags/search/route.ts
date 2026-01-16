import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createErrorResponse } from '@/lib/errors'

export const revalidate = 30

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

  const { searchParams } = new URL(request.url)
  const query = searchParams.get('q')?.toLowerCase() || ''
  const regionId = searchParams.get('region_id')

  if (!query || query.length < 2) {
    return NextResponse.json([])
  }

  try {
    let select = supabase
      .from('crags')
      .select('id,name,region_id,latitude,longitude,report_count,is_flagged')
      .ilike('name', `%${query}%`)
      .order('name', { ascending: true })
      .limit(30)

    if (regionId) {
      select = select.eq('region_id', regionId)
    }

    const { data, error } = await select

    if (error) {
      return createErrorResponse(error, 'Supabase error')
    }

    return NextResponse.json(data || [])
  } catch (error) {
    return createErrorResponse(error, 'Error searching crags')
  }
}
