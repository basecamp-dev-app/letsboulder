'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'

export default function ProfilePage() {
  const [user, setUser] = useState<any>(null)
  const [isPro, setIsPro] = useState(false)
  const [loading, setLoading] = useState(true)
  const searchParams = useSearchParams()

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
      setLoading(false)
    }
    checkUser()
  }, [])

  useEffect(() => {
    if (searchParams.get('success')) {
      alert('Payment successful! You are now a Pro member.')
    }
    if (searchParams.get('canceled')) {
      alert('Payment canceled. No worries, try again when ready!')
    }
  }, [searchParams])

  const handleUpgrade = async () => {
    const { data } = await fetch('/api/stripe/checkout', { method: 'POST' }).then(r => r.json())
    if (data?.url) {
      window.location.href = data.url
    }
  }

  if (loading) {
    return <div className="container mx-auto px-4 py-8 text-gray-900 dark:text-gray-100">Loading...</div>
  }

  if (!user) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold mb-4 text-gray-900 dark:text-gray-100">Profile</h1>
          <p className="mb-4 text-gray-700 dark:text-gray-300">You need to be logged in to view your profile.</p>
          <Link href="/auth" className="inline-block bg-gray-200 dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-4 py-2 rounded hover:bg-gray-300 dark:hover:bg-gray-700 transition-colors">
            Login
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-8 text-gray-900 dark:text-gray-100">Profile</h1>

      <div className="bg-white dark:bg-gray-900 rounded-lg shadow p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-gray-100">Account Information</h2>
        <div className="space-y-2 text-gray-700 dark:text-gray-300">
          <p><strong className="text-gray-900 dark:text-gray-200">Email:</strong> {user.email}</p>
          <p><strong className="text-gray-900 dark:text-gray-200">Status:</strong> {isPro ? <span className="text-green-600 dark:text-green-400">Pro Member</span> : <span>Free</span>}</p>
          <p><strong className="text-gray-900 dark:text-gray-200">Created:</strong> {new Date(user.created_at).toLocaleDateString()}</p>
        </div>
      </div>

      {!isPro && (
        <div className="bg-white dark:bg-gray-900 rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-gray-100">Upgrade to Pro</h2>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            Get access to log your sends and track your climbing progress!
          </p>
          <button
            onClick={handleUpgrade}
            className="bg-gray-800 dark:bg-gray-700 text-white px-4 py-2 rounded hover:bg-gray-700 dark:hover:bg-gray-600 transition-colors"
          >
            Upgrade - £2/month
          </button>
        </div>
      )}

      <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6">
        <Link href="/logbook" className="bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 p-6 rounded-lg shadow transition-colors">
          <h3 className="text-lg font-semibold mb-2 text-gray-900 dark:text-gray-100">My Logbook</h3>
          <p className="text-gray-600 dark:text-gray-400">View and manage your climbing logbook</p>
        </Link>

        <Link href="/upload" className="bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 p-6 rounded-lg shadow transition-colors">
          <h3 className="text-lg font-semibold mb-2 text-gray-900 dark:text-gray-100">Upload Route</h3>
          <p className="text-gray-600 dark:text-gray-400">Add new climbing routes to the map</p>
        </Link>
      </div>
    </div>
  )
}
