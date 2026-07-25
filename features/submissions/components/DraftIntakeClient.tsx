'use client'

import dynamic from 'next/dynamic'
import DraftIntakeLoadingShell from '@/features/submissions/components/DraftIntakeLoadingShell'

const DraftIntakeView = dynamic(
  () => import('@/features/submissions/components/DraftIntakeView'),
  { ssr: false, loading: () => <DraftIntakeLoadingShell /> }
)

export default function DraftIntakeClient({ cragId }: { cragId: string | null }) {
  return <DraftIntakeView cragId={cragId} />
}
