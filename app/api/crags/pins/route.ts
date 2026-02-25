import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

export async function GET() {
  const includePending = process.env.NEXT_PUBLIC_ALLOW_PENDING_IMAGES === 'true'

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return [] },
        setAll() {},
      },
    }
  )

  try {
    const { data, error } = await supabase.rpc('get_crag_pins', {
      include_pending: includePending,
    })

    if (error) {
      console.error('Error fetching crag pins:', error)
      return NextResponse.json({ error: 'Failed to fetch crag pins' }, { status: 500 })
    }

    return NextResponse.json({ pins: data || [] })
  } catch (error) {
    console.error('Unexpected error fetching crag pins:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
