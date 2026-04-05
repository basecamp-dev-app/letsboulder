'use client'

import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { User } from '@supabase/supabase-js'
import { useSearchParams } from 'next/navigation'
import LogbookView from '@/features/logbook/components/LogbookView'
import { LogbookSkeleton } from '@/features/logbook/components/LogbookStates'
import { useToast } from '@/features/logbook/components/Toast'
import { fetchOwnLogbookData, ownLogbookQueryKey, type OwnLogbookData } from '@/features/logbook/lib/queries'
import type { ServerLogbookSummary } from '@/features/logbook/lib/queries-server'

interface LogbookClientProps {
  user: User
  initialData?: ServerLogbookSummary
}

export default function LogbookClient({ user, initialData }: LogbookClientProps) {
  return <LogbookContent user={user} initialData={initialData} />
}

function LogbookContent({ user, initialData }: { user: User; initialData?: ServerLogbookSummary }) {
  const { addToast } = useToast()
  const hydratedInitialData = initialData
    ? {
        user,
        logs: initialData.logs,
        profile: initialData.profile,
        submissions: [],
      } satisfies OwnLogbookData
    : undefined
  const { data, isLoading } = useQuery({
    queryKey: ownLogbookQueryKey,
    queryFn: () => fetchOwnLogbookData(user),
    initialData: hydratedInitialData,
    gcTime: 30 * 60 * 1000,
  })

  if (isLoading) {
    return (
      <div className="min-h-screen bg-white dark:bg-gray-950">
        <LogbookSkeleton variant="own" />
      </div>
    )
  }

  return (
    <LogbookView
      toastListener={<LogbookPaymentToastListener onToast={addToast} />}
      userId={user.id}
      isOwnProfile={true}
      initialLogs={initialData?.logs || data?.logs || []}
      profile={initialData?.profile || data?.profile || undefined}
      initialSubmissions={data?.submissions || []}
    />
  )
}

function LogbookPaymentToastListener({
  onToast,
}: {
  onToast: (message: string, type?: 'success' | 'error' | 'info') => void
}) {
  const searchParams = useSearchParams()

  useEffect(() => {
    if (searchParams.get('success')) {
      onToast('Payment successful! You are now a Pro member.', 'success')
    }
    if (searchParams.get('canceled')) {
      onToast('Payment canceled. No worries, try again when ready!', 'info')
    }
  }, [searchParams, onToast])

  return null
}
