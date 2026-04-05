'use client'

import { useEffect, Suspense } from 'react'
import { useQuery } from '@tanstack/react-query'
import { User } from '@supabase/supabase-js'
import { useSearchParams } from 'next/navigation'
import LogbookView from '@/features/logbook/components/LogbookView'
import { LogbookSkeleton } from '@/features/logbook/components/LogbookStates'
import { useToast } from '@/features/logbook/components/Toast'
import { fetchOwnLogbookData, ownLogbookQueryKey, type OwnLogbookData } from '@/features/logbook/lib/queries'

function LoadingFallback() {
  return (
    <div className="min-h-screen bg-white dark:bg-gray-950">
      <LogbookSkeleton variant="own" />
    </div>
  )
}

interface LogbookClientProps {
  user: User
  initialData?: OwnLogbookData
}

export default function LogbookClient({ user, initialData }: LogbookClientProps) {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <LogbookContent user={user} initialData={initialData} />
    </Suspense>
  )
}

function LogbookContent({ user, initialData }: { user: User; initialData?: OwnLogbookData }) {
  const searchParams = useSearchParams()
  const { addToast } = useToast()
  const { data, isLoading } = useQuery({
    queryKey: ownLogbookQueryKey,
    queryFn: () => fetchOwnLogbookData(user),
    initialData,
    gcTime: 30 * 60 * 1000,
  })

  useEffect(() => {
    if (searchParams.get('success')) {
      addToast('Payment successful! You are now a Pro member.', 'success')
    }
    if (searchParams.get('canceled')) {
      addToast('Payment canceled. No worries, try again when ready!', 'info')
    }
  }, [searchParams, addToast])

  if (isLoading) {
    return (
      <div className="min-h-screen bg-white dark:bg-gray-950">
        <LogbookSkeleton variant="own" />
      </div>
    )
  }

  return (
    <LogbookView
      userId={user.id}
      isOwnProfile={true}
      initialLogs={data?.logs || []}
      profile={data?.profile || undefined}
      initialSubmissions={data?.submissions || []}
    />
  )
}
