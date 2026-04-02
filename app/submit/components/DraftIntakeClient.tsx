'use client'

import dynamic from 'next/dynamic'

const DraftIntakeView = dynamic(
  () => import('@/features/submissions/components/DraftIntakeView'),
  { ssr: false, loading: () => <div className="min-h-screen bg-gray-50 dark:bg-gray-900" /> }
)

export default function DraftIntakeClient() {
  return <DraftIntakeView />
}
