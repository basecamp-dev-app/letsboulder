import Link from 'next/link'

export default function OfflineFallbackPage() {
  return (
    <div className="min-h-screen bg-white dark:bg-gray-950 flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6">
        <p className="text-sm text-gray-600 dark:text-gray-400">You are offline.</p>
        <h1 className="text-xl font-semibold text-gray-900 dark:text-white mt-2">Offline mode</h1>
        <p className="text-sm text-gray-700 dark:text-gray-300 mt-2">
          Some pages need an internet connection. If you downloaded a crag for offline use, open it from your history or
          search once you are back online.
        </p>
        <Link
          href="/map"
          className="inline-flex items-center justify-center mt-4 w-full px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 dark:bg-gray-800 dark:hover:bg-gray-700"
        >
          Back to Map
        </Link>
      </div>
    </div>
  )
}
