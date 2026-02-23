import type { Metadata } from 'next'
import GymOwnerApplyForm from '@/app/gym-owners/components/GymOwnerApplyForm'

export const metadata: Metadata = {
  title: 'Gym Owners Apply',
  description: 'Apply for letsboulder gym-owner access.',
  alternates: {
    canonical: '/gym-owners/apply',
  },
  robots: {
    index: false,
    follow: true,
  },
}

export default function GymOwnersApplyPage() {
  return (
    <div className="min-h-screen bg-white dark:bg-gray-950">
      <div className="mx-auto max-w-3xl px-4 py-10 md:py-14">
        <header className="rounded-2xl border border-gray-200 bg-gray-50 p-6 dark:border-gray-800 dark:bg-gray-900 md:p-8">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Gym Owners</p>
          <h1 className="mt-2 text-3xl font-bold text-gray-900 dark:text-gray-100">Apply to try for free</h1>
          <p className="mt-3 text-sm text-gray-600 dark:text-gray-400">
            Fill in the form below. Once approved, we will contact you via WhatsApp.
          </p>
        </header>

        <GymOwnerApplyForm />
      </div>
    </div>
  )
}
