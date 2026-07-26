'use client'

import { useEffect, useRef } from 'react'
import { env } from '@/lib/env'

interface TurnstileProps {
  onVerify: (token: string) => void
  onError?: () => void
  onExpired?: () => void
  theme?: 'light' | 'dark' | 'auto'
  tabIndex?: number
  id?: string
}

export default function Turnstile({
  onVerify,
  onError,
  onExpired,
  theme = 'auto',
  tabIndex = 0,
  id,
}: TurnstileProps) {
  const widgetRef = useRef<HTMLDivElement | null>(null)
  const widgetIdRef = useRef<number | null>(null)
  const isClientRef = useRef(false)

  useEffect(() => {
    isClientRef.current = true

    if (!window.turnstile || !widgetRef.current) return

    const siteKey = env.NEXT_PUBLIC_TURNSTILE_SITE_KEY
    if (!siteKey) {
      return
    }

    widgetIdRef.current = window.turnstile.render(widgetRef.current, {
      sitekey: siteKey,
      theme,
      tabIndex,
      callback: (token: string) => {
        onVerify(token)
      },
      'error-callback': () => {
        onError?.()
      },
      'expired-callback': () => {
        onExpired?.()
      },
    })

    return () => {
      if (widgetIdRef.current !== null && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current)
        widgetIdRef.current = null
      }
    }
  }, [theme, tabIndex, onVerify, onError, onExpired])

  useEffect(() => {
    if (!isClientRef.current) return

    const script = document.createElement('script')
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js'
    script.async = true
    script.defer = true
    document.head.appendChild(script)

    return () => {
      const existingScript = document.querySelector('script[src*="turnstile"]')
      if (existingScript) {
        existingScript.remove()
      }
    }
  }, [])

  return <div ref={widgetRef} id={id} />
}

declare global {
  interface Window {
    turnstile: {
      render: (container: HTMLElement, options: {
        sitekey: string
        theme?: 'light' | 'dark' | 'auto'
        tabIndex?: number
        callback?: (token: string) => void
        'error-callback'?: () => void
        'expired-callback'?: () => void
      }) => number
      remove: (widgetId: number) => void
      reset: (widgetId?: number) => void
      getResponse: (widgetId?: number) => string | undefined
    }
  }
}