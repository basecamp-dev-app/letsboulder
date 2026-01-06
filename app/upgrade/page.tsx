'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'

export default function UpgradePage() {
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [isPro, setIsPro] = useState(false)

  useEffect(() => {
    const checkUser = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      setUser(user)

      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('is_pro')
          .eq('id', user.id)
          .single()
        setIsPro(profile?.is_pro || false)
      }
    }
    checkUser()
  }, [])

  const handleUpgrade = async () => {
    setLoading(true)
    try {
      const { data } = await fetch('/api/stripe/checkout', { method: 'POST' }).then(r => r.json())
      if (data?.url) {
        window.location.href = data.url
      } else {
        alert('Failed to start checkout. Please try again.')
      }
    } catch (error) {
      console.error('Checkout error:', error)
      alert('Failed to start checkout. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (isPro) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-md">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-8">You&apos;re a Pro Member!</h1>
        <div className="bg-white dark:bg-gray-900 rounded-xl shadow-lg p-6">
          <p className="text-gray-700 dark:text-gray-300 mb-4">
            Thank you for supporting gsyrocks! You have full access to all Pro features.
          </p>
          <Link href="/map" className="block w-full bg-gray-200 dark:bg-gray-800 text-gray-900 dark:text-gray-100 py-3 px-6 rounded-lg font-semibold text-center hover:bg-gray-300 dark:hover:bg-gray-700 transition-colors">
            Go to Map
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-md">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-8">Upgrade to Pro</h1>
      
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-lg p-6">
        <div className="text-center mb-6">
          <div className="text-4xl font-bold text-gray-900 dark:text-gray-100 mb-2">£2</div>
          <div className="text-gray-600 dark:text-gray-400">per month</div>
        </div>

        <ul className="space-y-3 mb-6 text-gray-700 dark:text-gray-300">
          <li className="flex items-center gap-2">
            <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            Log your sends (Flash, Top, Try)
          </li>
          <li className="flex items-center gap-2">
            <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            Track your climbing progress
          </li>
          <li className="flex items-center gap-2">
            <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            Support the site
          </li>
        </ul>

        {!user ? (
          <Link href="/auth" className="block w-full bg-gray-800 dark:bg-gray-700 text-white py-3 px-6 rounded-lg font-semibold text-center hover:bg-gray-700 dark:hover:bg-gray-600 transition-colors">
            Login to Upgrade
          </Link>
        ) : (
          <button
            onClick={handleUpgrade}
            disabled={loading}
            className="w-full bg-gray-800 dark:bg-gray-700 text-white py-3 px-6 rounded-lg font-semibold hover:bg-gray-700 dark:hover:bg-gray-600 transition-colors disabled:opacity-50"
          >
            {loading ? 'Loading...' : 'Subscribe - £2/month'}
          </button>
        )}
      </div>
    </div>
  )
}
