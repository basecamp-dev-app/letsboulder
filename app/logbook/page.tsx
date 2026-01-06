'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'

export default function LogbookPage() {
  const [user, setUser] = useState<any>(null)
  const [isPro, setIsPro] = useState(false)
  const [logs, setLogs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

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

        const { data: logsData } = await supabase
          .from('logs')
          .select('*, climbs(name, grade)')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })

        setLogs(logsData || [])
      }
      setLoading(false)
    }
    checkUser()
  }, [])

  const handleUpgrade = async () => {
    const { data } = await fetch('/api/stripe/checkout', { method: 'POST' }).then(r => r.json())
    if (data?.url) {
      window.location.href = data.url
    }
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-8 text-gray-900 dark:text-gray-100">My Climbing Logbook</h1>
      
      {!user ? (
        <div className="bg-white dark:bg-gray-900 p-6 rounded shadow">
          <p className="text-gray-600 dark:text-gray-400 mb-4">Please login to view your logbook.</p>
          <Link href="/auth" className="inline-block bg-gray-200 dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-4 py-2 rounded hover:bg-gray-300 dark:hover:bg-gray-700 transition-colors">
            Login
          </Link>
        </div>
      ) : !isPro ? (
        <div className="bg-white dark:bg-gray-900 p-6 rounded shadow">
          <p className="text-gray-600 dark:text-gray-400 mb-4">Upgrade to Pro to log your sends and track your progress!</p>
          <button onClick={handleUpgrade} className="bg-gray-800 dark:bg-gray-700 text-white px-4 py-2 rounded hover:bg-gray-700 dark:hover:bg-gray-600 transition-colors">
            Upgrade to Pro - £2/month
          </button>
        </div>
      ) : (
        <>
          <div className="bg-white dark:bg-gray-900 p-6 rounded shadow mb-6">
            <p className="text-gray-600 dark:text-gray-400">
              {loading ? 'Loading...' : `${logs.length} logged climbs`}
            </p>
          </div>
          
          {logs.length === 0 && (
            <div className="bg-white dark:bg-gray-900 p-6 rounded shadow">
              <p className="text-gray-600 dark:text-gray-400">No logs yet. Go to the map and log some climbs!</p>
            </div>
          )}
        </>
      )}
    </div>
  )
}
