'use client'

import { useEffect } from 'react'

export function CsrfProvider() {
  useEffect(() => {
    fetch('/api/csrf', { method: 'GET', credentials: 'include' })
      .then(r => r.json())
      .then(data => {
        if (data.token) {
          localStorage.setItem('csrf_token', data.token)
        }
      })
      .catch(console.error)
  }, [])

  return null
}
