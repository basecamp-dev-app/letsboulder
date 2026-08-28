'use client'

import { useEffect, useState } from 'react'
import * as Sentry from '@sentry/nextjs'
import { generateErrorId } from '@/lib/errors'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const [errorId] = useState(() => generateErrorId())

  useEffect(() => {
    Sentry.captureException(error, {
      tags: { error_id: errorId, location: 'global' },
    })
  }, [error, errorId])

  return (
    <html>
      <body>
        <main
          id="main-content"
          tabIndex={-1}
          style={{
            display: 'flex',
            minHeight: '100vh',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '1rem',
            padding: '2rem',
            textAlign: 'center',
            fontFamily: 'system-ui, sans-serif',
          }}
        >
          <h1 style={{ fontSize: '1.125rem', fontWeight: 600 }}>
            Something went wrong
          </h1>
          <p role="alert" style={{ fontSize: '0.875rem', color: '#6b7280' }}>
            An unexpected error occurred. Error ID:{' '}
            <code
              style={{
                borderRadius: '0.25rem',
                backgroundColor: '#f3f4f6',
                padding: '0.125rem 0.375rem',
                fontSize: '0.75rem',
              }}
            >
              {errorId}
            </code>
          </p>
          <button
            onClick={reset}
            style={{
              borderRadius: '0.375rem',
              backgroundColor: '#111827',
              color: '#fff',
              padding: '0.5rem 1rem',
              fontSize: '0.875rem',
              fontWeight: 500,
              cursor: 'pointer',
              border: 'none',
            }}
          >
            Try again
          </button>
          {/* The global error replaces the router context, so this recovery link must be a plain anchor. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/" style={{ color: '#374151', fontSize: '0.875rem' }}>
            Go to map
          </a>
        </main>
      </body>
    </html>
  )
}
