import { NextRequest, NextResponse } from 'next/server'

interface CreateCragRequest {
  name: string
  latitude: number
  longitude: number
  tide_level?: number
  region_name?: string
}

export async function POST(request: NextRequest) {
  try {
    const body: CreateCragRequest = await request.json()
    const { name, latitude, longitude, tide_level, region_name } = body

    if (!name || !latitude || !longitude) {
      return NextResponse.json(
        { error: 'Name, latitude, and longitude are required' },
        { status: 400 }
      )
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

    // Check if crag already exists at these coordinates
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

    // Check if crag with same name and region exists
    if (region_name) {
      const nameCheckResponse = await fetch(
        `${supabaseUrl}/rest/v1/crags?select=id,name,region_name&name=eq.${encodeURIComponent(name)}&region_name=eq.${encodeURIComponent(region_name)}&limit=1`,
        {
          headers: {
            'Authorization': `Bearer ${supabaseKey}`,
            'apikey': supabaseKey,
          },
        }
      )

      if (nameCheckResponse.ok) {
        const existingSameName = await nameCheckResponse.json()
        if (existingSameName.length > 0) {
          return NextResponse.json(
            { 
              error: `A crag named "${name}" already exists in ${region_name}`,
              existingCragId: existingSameName[0].id,
              existingCragName: existingSameName[0].name,
              code: 'DUPLICATE_NAME'
            },
            { status: 409 }
          )
        }
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
          tide_level: tide_level || null,
          region_name: region_name || null,
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

    const createdCrag = {
      id: response.headers.get('location')?.split('/').pop(),
      name,
      latitude,
      longitude,
      tide_level: tide_level || null,
      region_name: region_name || null,
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
