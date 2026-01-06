import { Suspense } from 'react'
import AuthForm from '@/components/AuthForm'

export default function AuthPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
        <p className="text-gray-500">Loading...</p>
      </div>
    }>
      <AuthForm />
    </Suspense>
  )
}
