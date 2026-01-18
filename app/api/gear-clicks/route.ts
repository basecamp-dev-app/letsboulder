import { NextRequest, NextResponse } from 'next/server'
import { getServerClient } from '@/lib/supabase-server'

export async function GET() {
  try {
    const supabase = await getServerClient()
    
    const { data, error } = await supabase
      .from('product_clicks')
      .select('product_id, click_count')
    
    if (error) {
      console.error('Failed to fetch click counts:', error)
      return NextResponse.json({}, { status: 500 })
    }
    
    const clickCounts: Record<string, number> = {}
    data?.forEach((row) => {
      clickCounts[row.product_id] = Number(row.click_count)
    })
    
    return NextResponse.json(clickCounts)
  } catch (error) {
    console.error('Error fetching click counts:', error)
    return NextResponse.json({}, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { productId } = await request.json()
    
    if (!productId) {
      return NextResponse.json({ error: 'Missing productId' }, { status: 400 })
    }
    
    const supabase = await getServerClient()
    
    const { error } = await supabase.rpc('increment_gear_click', { product_id_input: productId })
    
    if (error) {
      console.error('Failed to increment click count:', error)
      return NextResponse.json({ error: 'Failed to record click' }, { status: 500 })
    }
    
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error recording click:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
