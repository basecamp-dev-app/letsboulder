'use client'

import { useEffect, Suspense } from 'react'
import { useQuery } from '@tanstack/react-query'
import { User } from '@supabase/supabase-js'
import { useSearchParams } from 'next/navigation'
import LogbookView from '@/features/logbook/components/LogbookView'
import { LogbookSkeleton } from '@/features/logbook/components/logbook-states'
import { useToast } from '@/features/logbook/components/toast'
import { fetchOwnLogbookData, ownLogbookQueryKey } from '@/features/logbook/lib/queries'

function LoadingFallback() {
  return (
    <div className="min-h-screen bg-white dark:bg-gray-950">
      <LogbookSkeleton variant="own" />
    </div>
  )
}

export default function LogbookClient({ user }: { user: User }) {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <LogbookContent user={user} />
    </Suspense>
  )
}

function LogbookContent({ user }: { user: User }) {
  const searchParams = useSearchParams()
  const { addToast } = useToast()
  const { data, isLoading, error } = useQuery({
    queryKey: ownLogbookQueryKey,
    queryFn: () => fetchOwnLogbookData(user),
    staleTime: 60 * 1000,
    gcTime: 30 * 60 * 1000,
    meta: {
      persist: true,
    },
  })

  useEffect(() => {
    if (error) {
      console.error('Failed to load logbook:', error)
    }
  }, [error])

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
