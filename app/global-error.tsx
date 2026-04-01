'use client'

import { useEffect, useState } from 'react'
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
    console.error(`[${errorId}] Global error:`, error)
  }, [error, errorId])

  return (
    <html>
      <body>
        <div
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
          <h2 style={{ fontSize: '1.125rem', fontWeight: 600 }}>
            Something went wrong
          </h2>
          <p style={{ fontSize: '0.875rem', color: '#6b7280' }}>
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
        </div>
      </body>
    </html>
  )
}
