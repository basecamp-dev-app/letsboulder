'use client'

import { useEffect } from 'react'

type ConsoleMethod = (...args: unknown[]) => void
type ConsoleLevel = 'debug' | 'log' | 'error'

const NOISY_LOG_PATTERNS = [
  '[fast refresh]',
  '[hmr]',
  'download the react devtools',
  'analytics',
]

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function shouldSkipLog(args: unknown[]) {
  return args.some((arg) => {
    if (typeof arg !== 'string') return false
    const normalizedArg = arg.toLowerCase()
    return NOISY_LOG_PATTERNS.some((pattern) => normalizedArg.includes(pattern))
  })
}

function serializeValue(value: unknown, seen: WeakSet<object>): unknown {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
    }
  }

  if (typeof value === 'bigint') {
    return value.toString()
  }

  if (typeof value === 'function') {
    return `[Function ${value.name || 'anonymous'}]`
  }

  if (!value || typeof value !== 'object') {
    return value
  }

  if (seen.has(value)) {
    return '[Circular]'
  }

  seen.add(value)

  if (Array.isArray(value)) {
    return value.map((entry) => serializeValue(entry, seen))
  }

  const serializedEntries = Object.entries(value).map(([key, entry]) => [
    key,
    serializeValue(entry, seen),
  ])

  return Object.fromEntries(serializedEntries)
}

function serializeArgs(args: unknown[]) {
  const seen = new WeakSet<object>()
  return args.map((arg) => serializeValue(arg, seen))
}

function normalizeErrorEvent(event: ErrorEvent) {
  return {
    message: event.message,
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno,
    error: serializeValue(event.error, new WeakSet<object>()),
  }
}

function normalizeRejectionEvent(event: PromiseRejectionEvent) {
  return {
    reason: serializeValue(event.reason, new WeakSet<object>()),
  }
}

function normalizeResourceTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return null
  }

  if (target instanceof HTMLImageElement) {
    return {
      tagName: target.tagName,
      currentSrc: target.currentSrc,
      src: target.src,
      alt: target.alt,
    }
  }

  if (target instanceof HTMLScriptElement || target instanceof HTMLLinkElement) {
    return {
      tagName: target.tagName,
      src: 'src' in target ? target.src : undefined,
      href: 'href' in target ? target.href : undefined,
    }
  }

  return {
    tagName: target.tagName,
  }
}

async function postLog(level: ConsoleLevel, args: unknown[]) {
  if (shouldSkipLog(args)) {
    return
  }

  try {
    await fetch('/api/dev-logger', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        level,
        args: serializeArgs(args),
        url: window.location.href,
        timestamp: new Date().toISOString(),
      }),
      keepalive: true,
    })
  } catch {
    // Ignore logging transport failures to avoid noisy loops.
  }
}

export default function DevBrowserLogger() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') {
      return
    }

    const originalDebug = console.debug.bind(console) as ConsoleMethod
    const originalLog = console.log.bind(console) as ConsoleMethod
    const originalError = console.error.bind(console) as ConsoleMethod

    const handleWindowError = (event: ErrorEvent) => {
      void postLog('error', ['window-error', normalizeErrorEvent(event)])
    }

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      void postLog('error', ['unhandled-rejection', normalizeRejectionEvent(event)])
    }

    const handleResourceError = (event: Event) => {
      const target = normalizeResourceTarget(event.target)
      if (!target) return
      void postLog('error', ['resource-error', target])
    }

    const handleResourceLoad = (event: Event) => {
      const target = normalizeResourceTarget(event.target)
      if (!isPlainObject(target)) return
      if (target.tagName !== 'IMG') return
      if (typeof target.currentSrc !== 'string' || !target.currentSrc) return
      if (!/static\.dev\.letsboulder\.com|r2\.cloudflarestorage\.com/.test(target.currentSrc)) return
      void postLog('debug', ['resource-load', target])
    }

    console.debug = (...args: unknown[]) => {
      originalDebug(...args)
      void postLog('debug', args)
    }

    console.log = (...args: unknown[]) => {
      originalLog(...args)
      void postLog('log', args)
    }

    console.error = (...args: unknown[]) => {
      originalError(...args)
      void postLog('error', args)
    }

    window.addEventListener('error', handleWindowError)
    window.addEventListener('error', handleResourceError, true)
    window.addEventListener('load', handleResourceLoad, true)
    window.addEventListener('unhandledrejection', handleUnhandledRejection)

    return () => {
      console.debug = originalDebug
      console.log = originalLog
      console.error = originalError
      window.removeEventListener('error', handleWindowError)
      window.removeEventListener('error', handleResourceError, true)
      window.removeEventListener('load', handleResourceLoad, true)
      window.removeEventListener('unhandledrejection', handleUnhandledRejection)
    }
  }, [])

  return null
}
