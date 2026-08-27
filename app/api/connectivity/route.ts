import { NextResponse } from 'next/server'

import { CONNECTIVITY_RESPONSE_HEADER } from '@/lib/offline/connectivity'

export const dynamic = 'force-dynamic'

export function GET() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Cache-Control': 'no-store, max-age=0',
      [CONNECTIVITY_RESPONSE_HEADER]: 'online',
    },
  })
}
