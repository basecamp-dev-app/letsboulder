import Link from 'next/link'

export default function DeletionCancelledPage() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex flex-col items-center justify-center px-4">
      <div className="max-w-md w-full text-center">
        <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mb-6">
          <svg className="w-8 h-8 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Deletion Cancelled</h1>
        <p className="text-gray-500 dark:text-gray-400 mb-8">
          Your account deletion request has been cancelled. Your account remains active.
        </p>
        <div className="space-y-3">
          <Link
            href="/"
            className="block w-full px-6 py-2 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors"
          >
            Return to Home
          </Link>
          <Link
            href="/settings"
            className="block w-full px-6 py-2 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white rounded-lg font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            Go to Settings
          </Link>
        </div>
      </div>
    </div>
  )
}
