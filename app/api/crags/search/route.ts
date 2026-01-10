import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const query = searchParams.get('q')?.toLowerCase() || ''

  if (!query || query.length < 2) {
    return NextResponse.json([])
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

  try {
    const response = await fetch(
      `${supabaseUrl}/rest/v1/crags?select=id,name,region_name,tide_level,latitude,longitude,report_count,is_flagged&name=ilike.*${encodeURIComponent(query)}*&order=name.asc&limit=30`,
      {
        headers: {
          'Authorization': `Bearer ${supabaseKey}`,
          'apikey': supabaseKey,
        },
      }
    )

    if (!response.ok) {
      throw new Error('Failed to fetch crags')
    }

    const crags = await response.json()
    return NextResponse.json(crags)
  } catch (error) {
    console.error('Error searching crags:', error)
    return NextResponse.json(
      { error: 'Failed to search crags' },
      { status: 500 }
    )
  }
}
