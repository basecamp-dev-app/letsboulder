import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

const MAX_ROUTES_PER_DAY = 5

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

  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { name, grade, imageUrl, latitude, longitude, cragsId } = body

    if (!name || !grade || !imageUrl || !latitude || !longitude || !cragsId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const validGrades = [
      '5A', '5A+', '5B', '5B+', '5C', '5C+',
      '6A', '6A+', '6B', '6B+', '6C', '6C+',
      '7A', '7A+', '7B', '7B+', '7C', '7C+',
      '8A', '8A+', '8B', '8B+', '8C', '8C+',
      '9A', '9A+', '9B', '9B+', '9C', '9C+'
    ]

    if (!validGrades.includes(grade)) {
      return NextResponse.json({ error: 'Invalid grade' }, { status: 400 })
    }

    const today = new Date().toISOString().split('T')[0]
    const { count: todayRoutes } = await supabase
      .from('climbs')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('deleted_at', null)
      .gte('created_at', `${today}T00:00:00`)

    if ((todayRoutes || 0) >= MAX_ROUTES_PER_DAY) {
      return NextResponse.json({
        error: `Daily limit reached. You can submit ${MAX_ROUTES_PER_DAY} routes per day.`
      }, { status: 429 })
    }

    const routeId = crypto.randomUUID()

    const { error: insertError } = await supabase
      .from('climbs')
      .insert({
        id: routeId,
        name,
        grade,
        crags_id: cragsId,
        latitude,
        longitude,
        image_url: imageUrl,
        user_id: user.id,
        status: 'discord_pending',
        created_at: new Date().toISOString()
      })

    if (insertError) {
      console.error('Route insert error:', insertError)
      return NextResponse.json({ error: 'Failed to save route' }, { status: 500 })
    }

    const discordBotToken = process.env.DISCORD_BOT_TOKEN
    const discordChannelId = process.env.DISCORD_ROUTE_APPROVAL_CHANNEL_ID

    if (discordBotToken && discordChannelId) {
      try {
        console.log('[Route Submit] Posting to Discord directly...')
        
        const discordResponse = await fetch(`https://discord.com/api/v10/channels/${discordChannelId}/messages`, {
          method: 'POST',
          headers: {
            'Authorization': `Bot ${discordBotToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            content: 'New route submitted for approval!',
            embeds: [{
              title: 'New Route Submission',
              color: 0xf1c40f,
              fields: [
                { name: 'Route', value: name, inline: true },
                { name: 'Grade', value: grade, inline: true },
                { name: 'Location', value: `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`, inline: true },
                { name: 'Submitted by', value: user.email?.split('@')[0] || 'Anonymous', inline: true }
              ],
              footer: { text: `ID: ${routeId}` }
            }],
            components: [{
              type: 1,
              components: [
                { type: 2, style: 3, label: 'Approve', custom_id: `approve_route_${routeId}` },
                { type: 2, style: 4, label: 'Reject', custom_id: `reject_route_${routeId}` }
              ]
            }]
          })
        })

        console.log('[Route Submit] Discord response status:', discordResponse.status)
        
        if (discordResponse.ok) {
          const messageData = await discordResponse.json()
          console.log('[Route Submit] Discord message ID:', messageData.id)
        }
      } catch (discordError) {
        console.error('[Route Submit] Failed to post to Discord:', discordError)
      }
    } else {
      console.warn('[Route Submit] Discord credentials not configured')
    }

    return NextResponse.json({
      success: true,
      routeId,
      message: 'Route submitted for review. You will receive an email when it is approved.'
    })
  } catch (error) {
    console.error('Route submission error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({ 
    message: 'Route submission endpoint',
    method: 'POST',
    required_fields: ['name', 'grade', 'imageUrl', 'latitude', 'longitude', 'cragsId'],
    rate_limit: `${MAX_ROUTES_PER_DAY} routes per day`
  })
}
