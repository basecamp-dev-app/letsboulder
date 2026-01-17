'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { AlertCircle, RefreshCw } from 'lucide-react'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  console.error('Sponsors page error:', error)

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">
          gsyrocks Sponsor Report
        </h1>
        <p className="text-lg text-gray-600 dark:text-gray-400">
          Monthly engagement metrics for potential sponsors and partners
        </p>
      </div>

      <Card className="border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-red-700 dark:text-red-400">
            <AlertCircle className="h-5 w-5" />
            Unable to Load Metrics
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-gray-600 dark:text-gray-400">
            We encountered an error while fetching sponsor metrics. This may be a temporary issue
            with the analytics service.
          </p>
          <div className="flex items-center gap-4">
            <button
              onClick={() => reset()}
              className="inline-flex items-center gap-2 px-4 py-2 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded-md hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors"
            >
              <RefreshCw className="h-4 w-4" />
              Try Again
            </button>
            <a
              href="/api/test-posthog"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-gray-600 dark:text-gray-400 hover:underline"
            >
              Test PostHog Connection
            </a>
          </div>
          {process.env.NODE_ENV === 'development' && (
            <pre className="mt-4 p-3 bg-gray-100 dark:bg-gray-800 rounded text-xs overflow-auto">
              {error.message}
              {error.digest && `\nDigest: ${error.digest}`}
            </pre>
          )}
        </CardContent>
      </Card>

      <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
        <p className="text-gray-500 dark:text-gray-400 text-sm">
          <a href="/about" className="hover:underline">About</a>
          {' · '}
          <a href="/privacy" className="hover:underline">Privacy</a>
          {' · '}
          <a href="/terms" className="hover:underline">Terms</a>
          {' · '}
          <a href="/sponsors" className="hover:underline">Sponsors</a>
          {' · '}
          <a href="mailto:hello@gsyrocks.com" className="hover:underline">Contact</a>
        </p>
      </div>
    </div>
  )
}
