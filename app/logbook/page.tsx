'use client'

import { useEffect, Suspense } from 'react'
import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
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

export default function LogbookPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <LogbookContent />
    </Suspense>
  )
}

function LogbookContent() {
  const searchParams = useSearchParams()
  const { addToast } = useToast()
  const { data, isLoading, error } = useQuery({
    queryKey: ownLogbookQueryKey,
    queryFn: fetchOwnLogbookData,
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

  if (!data?.user) {
    return (
      <div className="min-h-screen bg-white dark:bg-gray-950 px-4 py-8">
        <Card className="max-w-sm mx-auto">
          <CardContent className="pt-6">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4">
              My Climbing Logbook
            </h1>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              Please login to view your logbook.
            </p>
            <Link href="/auth">
              <Button>Login</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <LogbookView
      userId={data.user.id}
      isOwnProfile={true}
      initialLogs={data.logs}
      profile={data.profile || undefined}
      initialSubmissions={data.submissions}
    />
  )
}
