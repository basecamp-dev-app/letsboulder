'use client'

import { useEffect, useState } from 'react'

export function useCsrfToken(): string | null {
  const [token, setToken] = useState<string | null>(null)

  useEffect(() => {
    const fetchToken = async () => {
      try {
        const response = await fetch('/api/csrf', { method: 'GET' })
        if (response.ok) {
          const data = await response.json()
          setToken(data.token)
        }
      } catch {
        console.error('Failed to fetch CSRF token')
      }
    }
    fetchToken()
  }, [])

  return token
}

export async function csrfFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const token = typeof window !== 'undefined' 
    ? document.cookie.match(/csrf_token=([^;]+)/)?.[1] || ''
    : ''

  const headers = {
    ...((init?.headers as Record<string, string>) || {}),
    'x-csrf-token': token
  }

  return fetch(input, { ...init, headers })
}
