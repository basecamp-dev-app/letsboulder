'use client'

import { useEffect, useState } from 'react'
import * as Sentry from '@sentry/nextjs'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { generateErrorId } from '@/lib/errors'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const [errorId] = useState(() => generateErrorId())

  useEffect(() => {
    Sentry.captureException(error, {
      tags: { error_id: errorId, location: 'crag-detail' },
    })
  }, [error, errorId])

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 p-8 text-center">
      <h2 className="text-lg font-semibold">Something went wrong</h2>
      <p className="text-sm text-muted-foreground">
        Unable to load this crag. Error ID:{' '}
        <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
          {errorId}
        </code>
      </p>
      <div className="flex gap-3">
        <Button onClick={reset}>Try again</Button>
        <Button variant="outline" asChild>
          <Link href="/">Go home</Link>
        </Button>
      </div>
    </div>
  )
}
