'use client'

export default function Loading() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="max-w-md mx-auto">
          <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-gray-100">Upload Route Photo</h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            Each pin creates one submission. You can include multiple photos as faces in that same submission.
          </p>
          <div className="space-y-4 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
            <div className="h-12 rounded-lg bg-gray-200 dark:bg-gray-800 animate-pulse" />
            <div className="h-12 rounded-lg bg-gray-200 dark:bg-gray-800 animate-pulse" />
            <div className="h-24 rounded-lg bg-gray-100 dark:bg-gray-800/60 animate-pulse" />
          </div>
        </div>
      </main>
    </div>
  )
}
