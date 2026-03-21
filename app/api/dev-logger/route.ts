import { appendFile } from 'node:fs/promises'
import path from 'node:path'
import { NextRequest, NextResponse } from 'next/server'

const LOG_FILE_PATH = path.join(process.cwd(), 'browser-debug.log')

type DevLoggerPayload = {
  level?: unknown
  args?: unknown
  url?: unknown
  timestamp?: unknown
}

function isLocalRequest(request: NextRequest) {
  const hostHeader = request.headers.get('host') || request.nextUrl.host
  const host = hostHeader.split(':')[0].toLowerCase()

  return host === 'localhost' || host === '127.0.0.1'
}

export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV !== 'development' || !isLocalRequest(request)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  let payload: DevLoggerPayload

  try {
    payload = await request.json() as DevLoggerPayload
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const level = payload.level === 'error' ? 'error' : 'log'
  const args = Array.isArray(payload.args) ? payload.args : []
  const url = typeof payload.url === 'string' ? payload.url : 'unknown'
  const timestamp = typeof payload.timestamp === 'string'
    ? payload.timestamp
    : new Date().toISOString()

  const line = `${JSON.stringify({ timestamp, level, url, args })}\n`

  try {
    await appendFile(LOG_FILE_PATH, line, 'utf8')
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Failed to write log' }, { status: 500 })
  }
}
