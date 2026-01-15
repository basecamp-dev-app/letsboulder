import Link from 'next/link'

export default function DeletionScheduledPage() {
  const deletionDate = new Date(Date.now() + 48 * 60 * 60 * 1000)

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex flex-col items-center justify-center px-4">
      <div className="max-w-md w-full text-center">
        <div className="w-16 h-16 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center mb-6">
          <svg className="w-8 h-8 text-amber-600 dark:text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Deletion Scheduled</h1>
        <p className="text-gray-500 dark:text-gray-400 mb-6">
          Your account deletion has been scheduled.
        </p>
        <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg mb-6">
          <p className="text-sm text-amber-800 dark:text-amber-200">
            <strong>Scheduled for:</strong><br />
            {deletionDate.toLocaleDateString()} at {deletionDate.toLocaleTimeString()}
          </p>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
          You will receive an email confirmation shortly. You may cancel this deletion by clicking the cancellation link in that email.
        </p>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          If you change your mind before the scheduled date, simply <strong>sign in</strong> to cancel the deletion request.
        </p>
        <Link
          href="/"
          className="inline-block mt-8 px-6 py-2 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors"
        >
          Return to Home
        </Link>
      </div>
    </div>
  )
}
