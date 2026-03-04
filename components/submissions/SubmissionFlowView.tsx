'use client'

import Link from 'next/link'
import SubmitClient from '@/app/submit/SubmitClient'

export default function SubmissionFlowView() {
  return (
    <div>
      <div className="border-b border-gray-200 bg-white px-4 py-3 dark:border-gray-800 dark:bg-gray-900">
        <Link
          href="/logbook/submissions"
          className="text-sm text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200"
        >
          ← Back to submissions
        </Link>
      </div>
      <SubmitClient />
    </div>
  )
}
