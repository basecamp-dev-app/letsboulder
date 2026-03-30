import Link from 'next/link'

export default function DeleteSuccessPage() {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center text-center px-4">
      <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mb-6">
        <svg className="w-8 h-8 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Account Deleted</h1>
      <p className="text-gray-500 dark:text-gray-400 max-w-md mb-8">
        Your account and all associated data have been permanently deleted.
        All uploaded images have been removed from our servers.
      </p>
      <Link
        href="/"
        className="px-6 py-2 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors"
      >
        Return to Home
      </Link>
    </div>
  )
}
