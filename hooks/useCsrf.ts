'use client'

let csrfTokenPromise: Promise<string> | null = null

const CSRF_TOKEN_KEY = 'csrf_token'
const CSRF_META_KEY = 'csrf_token_meta'
const CSRF_MAX_AGE_MS = 2 * 60 * 60 * 1000
const CSRF_REFRESH_SKEW_MS = 5 * 60 * 1000

function clearStoredCsrfToken(): void {
  if (typeof window === 'undefined') return
  localStorage.removeItem(CSRF_TOKEN_KEY)
  localStorage.removeItem(CSRF_META_KEY)
}

function getStoredCsrfToken(): string {
  if (typeof window === 'undefined') return ''

  const token = localStorage.getItem(CSRF_TOKEN_KEY) || ''
  if (!token) return ''

  const rawMeta = localStorage.getItem(CSRF_META_KEY)
  if (!rawMeta) {
    clearStoredCsrfToken()
    return ''
  }

  try {
    const parsed = JSON.parse(rawMeta) as { fetchedAt?: unknown }
    const fetchedAt = typeof parsed.fetchedAt === 'number' ? parsed.fetchedAt : 0
    if (!fetchedAt) {
      clearStoredCsrfToken()
      return ''
    }

    if (Date.now() - fetchedAt >= CSRF_MAX_AGE_MS - CSRF_REFRESH_SKEW_MS) {
      clearStoredCsrfToken()
      return ''
    }

    return token
  } catch {
    clearStoredCsrfToken()
    return ''
  }
}

function storeCsrfToken(token: string): void {
  if (typeof window === 'undefined' || !token) return
  localStorage.setItem(CSRF_TOKEN_KEY, token)
  localStorage.setItem(CSRF_META_KEY, JSON.stringify({ fetchedAt: Date.now() }))
}

async function fetchAndStoreCsrfToken(forceRefresh = false): Promise<string> {
  if (typeof window === 'undefined') return ''

  if (!forceRefresh) {
    const existing = getStoredCsrfToken()
    if (existing) return existing
  }

  if (!forceRefresh && csrfTokenPromise) return csrfTokenPromise

  const p = (async () => {
    const response = await fetch('/api/csrf', { method: 'GET', credentials: 'include' })
    const data = await response.json().catch(() => ({} as { token?: string }))
    const token = typeof data?.token === 'string' ? data.token : ''
    if (token) {
      storeCsrfToken(token)
    } else {
      clearStoredCsrfToken()
    }
    return token
  })()

  if (!forceRefresh) csrfTokenPromise = p

  try {
    return await p
  } finally {
    if (csrfTokenPromise === p) csrfTokenPromise = null
  }
}

export async function primeCsrfToken(): Promise<string> {
  return fetchAndStoreCsrfToken(false)
}

export async function refreshCsrfToken(): Promise<string> {
  return fetchAndStoreCsrfToken(true)
}

function isStateChangingMethod(method: string): boolean {
  const m = method.toUpperCase()
  return m !== 'GET' && m !== 'HEAD' && m !== 'OPTIONS'
}

function getRequestMethod(input: RequestInfo | URL, init?: RequestInit): string {
  if (init?.method) return init.method
  if (typeof Request !== 'undefined' && input instanceof Request) return input.method
  return 'GET'
}

function getUrl(input: RequestInfo | URL): URL | null {
  if (typeof window === 'undefined') return null
  try {
    if (typeof input === 'string') return new URL(input, window.location.origin)
    if (typeof URL !== 'undefined' && input instanceof URL) return input
    if (typeof Request !== 'undefined' && input instanceof Request) return new URL(input.url)
    return null
  } catch {
    return null
  }
}

function isSameOriginApiRequest(url: URL | null): boolean {
  if (typeof window === 'undefined' || !url) return false
  return url.origin === window.location.origin && url.pathname.startsWith('/api/')
}

async function isCsrfError(response: Response): Promise<boolean> {
  if (response.status !== 403) return false
  const data = await response.clone().json().catch(() => null as unknown)
  if (!data || typeof data !== 'object') return false
  const error = (data as { error?: unknown }).error
  return typeof error === 'string' && error.toLowerCase().includes('csrf')
}

export async function csrfFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const url = getUrl(input)
  const method = getRequestMethod(input, init)
  const isSameOriginApi = isSameOriginApiRequest(url)
  const isStateChanging = isStateChangingMethod(method)

  const headers = new Headers(
    init?.headers || (typeof Request !== 'undefined' && input instanceof Request ? input.headers : undefined)
  )

  if (typeof window !== 'undefined' && isSameOriginApi && isStateChanging) {
    const token = await fetchAndStoreCsrfToken(false)
    if (token) headers.set('x-csrf-token', token)
  }

  const credentials = init?.credentials ?? (isSameOriginApi ? 'include' : undefined)

  const response = await fetch(input, { ...init, headers, credentials })

  if (typeof window !== 'undefined' && isSameOriginApi && isStateChanging && await isCsrfError(response)) {
    const refreshed = await fetchAndStoreCsrfToken(true)
    if (!refreshed) return response

    const retryHeaders = new Headers(headers)
    retryHeaders.set('x-csrf-token', refreshed)

    return fetch(input, { ...init, headers: retryHeaders, credentials })
  }

  return response
}
