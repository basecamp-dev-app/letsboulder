import { appendFile } from 'node:fs/promises'
import path from 'node:path'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { parseWithSchema } from '@/lib/api-validation'

const LOG_FILE_PATH = path.join(process.cwd(), 'browser-debug.log')

const devLoggerSchema = z.object({
  level: z.enum(['log', 'error']).optional(),
  args: z.array(z.unknown()).optional(),
  url: z.string().optional(),
  timestamp: z.string().optional(),
})

function isLocalRequest(request: NextRequest) {
  const hostHeader = request.headers.get('host') || request.nextUrl.host
  const host = hostHeader.split(':')[0].toLowerCase()

  return host === 'localhost' || host === '127.0.0.1'
}

export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV !== 'development' || !isLocalRequest(request)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  let payload: unknown

  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsedPayload = parseWithSchema(devLoggerSchema, payload)
  if (!parsedPayload.success) return parsedPayload.response
  const data = parsedPayload.data

  const level = data.level === 'error' ? 'error' : 'log'
  const args = data.args || []
  const url = data.url || 'unknown'
  const timestamp = typeof data.timestamp === 'string'
    ? data.timestamp
    : new Date().toISOString()

  const line = `${JSON.stringify({ timestamp, level, url, args })}\n`

  try {
    await appendFile(LOG_FILE_PATH, line, 'utf8')
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Failed to write log' }, { status: 500 })
  }
}
