import { Suspense } from 'react'
import AuthForm from '@/components/AuthForm'
import { Skeleton } from '@/components/ui/skeleton'

function AuthLoadingFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 dark:bg-gray-950">
      <div className="w-full max-w-md">
        <div className="rounded-xl bg-white p-8 shadow-lg dark:bg-gray-900">
          <Skeleton className="mx-auto h-8 w-48" />
          <Skeleton className="mx-auto mt-3 h-4 w-full max-w-sm" />
          <p className="mt-4 text-center text-sm text-gray-500 dark:text-gray-400">Loading sign-in options and return path...</p>

          <div className="mt-6 space-y-4">
            <Skeleton className="h-12 w-full rounded-lg" />
            <Skeleton className="h-12 w-full rounded-lg" />
          </div>

          <div className="my-6 flex items-center gap-4">
            <div className="h-px flex-1 bg-gray-200 dark:bg-gray-700" />
            <span className="text-sm text-gray-400 dark:text-gray-500">or</span>
            <div className="h-px flex-1 bg-gray-200 dark:bg-gray-700" />
          </div>

          <Skeleton className="h-4 w-40 mx-auto" />

          <div className="mt-6 border-t border-gray-200 pt-6 dark:border-gray-700">
            <Skeleton className="h-3 w-full" />
            <Skeleton className="mt-2 h-3 w-5/6" />
          </div>
        </div>
      </div>
    </div>
  )
}

export default function AuthPage() {
  return (
    <Suspense fallback={<AuthLoadingFallback />}>
      <AuthForm />
    </Suspense>
  )
}
