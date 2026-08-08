import { NextResponse } from 'next/server'

const MAX_ROUTES_PER_DAY = 5

export async function POST() {
  return NextResponse.json({ error: 'Legacy image URL route submission has been retired' }, { status: 410 })
}

export async function GET() {
  return NextResponse.json({ 
    message: 'Route submission endpoint',
    method: 'POST',
    required_fields: ['name', 'grade', 'imageUrl', 'latitude', 'longitude', 'cragsId'],
    rate_limit: `${MAX_ROUTES_PER_DAY} routes per day`
  })
}
