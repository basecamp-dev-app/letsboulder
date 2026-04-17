/* eslint-disable no-console */
'use client'

type DebugPayload = Record<string, unknown>

const COUNTERS = new Map<string, number>()
const WINDOW_MS = 1000
const MAX_LOGS_PER_WINDOW = 20

let windowStart = 0
let windowCount = 0
let suppressionNoticeShown = false

function isDebugEnabled() {
  if (typeof window === 'undefined') return false

  try {
    const searchParams = new URLSearchParams(window.location.search)
    if (searchParams.get('debugRouteLoop') === '1') return true
    return window.localStorage.getItem('debugRouteLoop') === '1'
  } catch {
    return false
  }
}

function allowLog() {
  const now = Date.now()
  if (now - windowStart > WINDOW_MS) {
    windowStart = now
    windowCount = 0
    suppressionNoticeShown = false
  }

  windowCount += 1
  if (windowCount <= MAX_LOGS_PER_WINDOW) return true

  if (!suppressionNoticeShown) {
    suppressionNoticeShown = true
    console.warn('[route-loop]', 'log limit reached for current window')
  }

  return false
}

export function logRouteLoop(event: string, payload: DebugPayload = {}) {
  if (!isDebugEnabled()) return
  if (!allowLog()) return

  const count = (COUNTERS.get(event) || 0) + 1
  COUNTERS.set(event, count)

  console.log('[route-loop]', {
    event,
    count,
    at: new Date().toISOString(),
    ...payload,
  })
}
