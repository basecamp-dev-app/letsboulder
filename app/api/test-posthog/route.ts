import { NextResponse } from 'next/server'
import { getSponsorMetrics } from '@/lib/posthog-server'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const metrics = await getSponsorMetrics()
    return NextResponse.json({ success: true, metrics })
  } catch (error) {
    console.error('PostHog test failed:', error)
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    )
  }
}
