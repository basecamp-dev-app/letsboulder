import { NextRequest, NextResponse } from 'next/server'

interface CreateCragRequest {
  name: string
  latitude: number
  longitude: number
  region_id?: string
  region_name?: string
  rock_type?: string
  type?: 'sport' | 'boulder' | 'trad' | 'mixed'
  description?: string
  access_notes?: string
}

export async function POST(request: NextRequest) {
  try {
    const body: CreateCragRequest = await request.json()
    const { name, latitude, longitude, region_id, region_name, rock_type, type, description, access_notes } = body

    if (!name || !latitude || !longitude) {
      return NextResponse.json(
        { error: 'Name, latitude, and longitude are required' },
        { status: 400 }
      )
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

    let resolvedRegionId = region_id

    if (!resolvedRegionId && region_name) {
      const regionSearchResponse = await fetch(
        `${supabaseUrl}/rest/v1/regions?select=id,name&name=ilike.${encodeURIComponent(region_name)}&limit=1`,
        {
          headers: {
            'Authorization': `Bearer ${supabaseKey}`,
            'apikey': supabaseKey,
          },
        }
      )

      if (regionSearchResponse.ok) {
        const regions = await regionSearchResponse.json()
        if (regions.length > 0) {
          resolvedRegionId = regions[0].id
        } else {
          const createRegionResponse = await fetch(
            `${supabaseUrl}/rest/v1/regions`,
            {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${supabaseKey}`,
                'apikey': supabaseKey,
                'Content-Type': 'application/json',
                'Prefer': 'return=minimal',
              },
              body: JSON.stringify({ name: region_name }),
            }
          )
          if (createRegionResponse.ok) {
            resolvedRegionId = createRegionResponse.headers.get('location')?.split('/').pop() || undefined
          }
        }
      }
    }

    const checkResponse = await fetch(
      `${supabaseUrl}/rest/v1/crags?select=id,name&latitude=eq.${latitude}&longitude=eq.${longitude}&limit=1`,
      {
        headers: {
          'Authorization': `Bearer ${supabaseKey}`,
          'apikey': supabaseKey,
        },
      }
    )

    if (checkResponse.ok) {
      const existingCrags = await checkResponse.json()
      if (existingCrags.length > 0) {
        return NextResponse.json(
          { 
            error: `A crag already exists at these coordinates: "${existingCrags[0].name}"`,
            existingCragId: existingCrags[0].id,
            existingCragName: existingCrags[0].name,
            code: 'DUPLICATE'
          },
          { status: 409 }
        )
      }
    }

    const response = await fetch(
      `${supabaseUrl}/rest/v1/crags`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseKey}`,
          'apikey': supabaseKey,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify({
          name,
          latitude,
          longitude,
          region_id: resolvedRegionId || undefined,
          rock_type: rock_type || undefined,
          type: type || 'sport',
          description: description || undefined,
          access_notes: access_notes || undefined,
        }),
      }
    )

    const errorText = await response.text()

    if (!response.ok) {
      let errorMessage = 'Failed to create crag'
      let errorCode = ''

      try {
        const errorJson = JSON.parse(errorText)
        if (errorJson.message) {
          errorMessage = errorJson.message
        } else if (errorJson.error) {
          errorMessage = errorJson.error
        }
        if (errorJson.code) {
          errorCode = errorJson.code
        }
      } catch {
        errorMessage = `Server error: ${errorText.substring(0, 100)}`
      }

      return NextResponse.json(
        { error: errorMessage, code: errorCode },
        { status: response.status }
      )
    }

    const createdCragId = response.headers.get('location')?.split('/').pop()

    const createdCrag = {
      id: createdCragId,
      name,
      latitude,
      longitude,
      region_id: resolvedRegionId || null,
      rock_type: rock_type || null,
      type: type || 'sport',
      created_at: new Date().toISOString(),
    }

    return NextResponse.json(createdCrag, { status: 201 })
  } catch (error) {
    console.error('Error creating crag:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create crag' },
      { status: 500 }
    )
  }
}
