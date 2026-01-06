'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'

interface LoggedClimb {
  id: string
  climb_id: string
  status: string
  created_at: string
  climbs: {
    name: string
    grade: string
    image_url?: string
    crags: {
      name: string
    }
  }
}

export default function LogbookPage() {
  const [user, setUser] = useState<any>(null)
  const [logs, setLogs] = useState<LoggedClimb[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const checkUser = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      setUser(user)

      if (user) {
        const { data: logsData } = await supabase
          .from('logs')
          .select('*, climbs(name, grade, image_url, crags(name))')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })

        setLogs(logsData || [])
      }
      setLoading(false)
    }
    checkUser()
  }, [])

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold mb-8 text-gray-900 dark:text-gray-100">My Climbing Logbook</h1>
        <p className="text-gray-600 dark:text-gray-400">Loading...</p>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold mb-8 text-gray-900 dark:text-gray-100">My Climbing Logbook</h1>
        <div className="bg-white dark:bg-gray-900 p-6 rounded shadow">
          <p className="text-gray-600 dark:text-gray-400 mb-4">Please login to view your logbook.</p>
          <Link href="/auth" className="inline-block bg-gray-200 dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-4 py-2 rounded hover:bg-gray-300 dark:hover:bg-gray-700 transition-colors">
            Login
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-8 text-gray-900 dark:text-gray-100">My Climbing Logbook</h1>
      
      <div className="bg-white dark:bg-gray-900 p-6 rounded shadow mb-6">
        <p className="text-gray-600 dark:text-gray-400">
          {logs.length} logged climb{logs.length !== 1 ? 's' : ''}
        </p>
      </div>

      {logs.length === 0 ? (
        <div className="bg-white dark:bg-gray-900 p-6 rounded shadow">
          <p className="text-gray-600 dark:text-gray-400 mb-4">No logs yet. Go to the map and log some climbs!</p>
          <Link href="/map" className="inline-block bg-gray-200 dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-4 py-2 rounded hover:bg-gray-300 dark:hover:bg-gray-700 transition-colors">
            Go to Map
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {logs.map((log) => (
            <div key={log.id} className="bg-white dark:bg-gray-900 p-4 rounded shadow flex items-center gap-4">
              {log.climbs?.image_url && (
                <img 
                  src={log.climbs.image_url} 
                  alt={log.climbs.name}
                  className="w-16 h-16 object-cover rounded"
                />
              )}
              <div className="flex-1">
                <p className="font-semibold text-gray-900 dark:text-gray-100">{log.climbs?.name}</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {log.climbs?.grade} • {log.climbs?.crags?.name}
                </p>
              </div>
              <div className="text-right">
                <span className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${
                  log.status === 'flash' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' :
                  log.status === 'top' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' :
                  'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
                }`}>
                  {log.status}
                </span>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {new Date(log.created_at).toLocaleDateString()}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
