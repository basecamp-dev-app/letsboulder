import { Suspense } from 'react'
import SubmissionManager from '@/features/submissions/components/SubmissionManager'

function LoadingFallback() {
  return <div className="min-h-screen bg-white dark:bg-gray-950" />
}

export default function SubmissionsPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <SubmissionManager />
    </Suspense>
  )
}
