'use client'

import { useEffect } from 'react'
import { primeCsrfToken } from '@/hooks/useCsrf'

export function CsrfProvider() {
  useEffect(() => {
    void primeCsrfToken().catch(() => {})
  }, [])

  return null
}
