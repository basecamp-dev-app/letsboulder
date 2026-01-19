'use client'

export async function csrfFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const token = typeof window !== 'undefined'
    ? localStorage.getItem('csrf_token') || ''
    : ''

  const headers = {
    ...((init?.headers as Record<string, string>) || {}),
    'x-csrf-token': token
  }

  return fetch(input, { ...init, headers })
}
