import { NextRequest, NextResponse } from 'next/server'
import { getServerClientFromRequest } from '@/lib/supabase-server'

export async function GET(request: NextRequest) {
  const supabase = getServerClientFromRequest(request)
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')?.trim()

  if (!id) {
    return NextResponse.json({ error: 'Crag id is required' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('crags')
    .select('id,name,latitude,longitude,country_code,region_name,sub_area,rock_type,type,description,access_notes,region_id,created_at')
    .eq('id', id)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: 'Failed to load crag' }, { status: 500 })
  }

  if (!data || data.latitude === null || data.longitude === null) {
    return NextResponse.json(null)
  }

  return NextResponse.json({
    ...data,
    countryCode: data.country_code,
    regionName: data.region_name,
    subArea: data.sub_area,
  })
}
