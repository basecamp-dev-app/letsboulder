'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'

export default function LogbookPage() {
  const [logs, setLogs] = useState<any[]>([])

  useEffect(() => {
    const fetchLogs = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      if (user) {
        const { data } = await supabase
          .from('logs') // Assuming a logs table
          .select('*')
          .eq('user_id', user.id)

        setLogs(data || [])
      }
    }

    fetchLogs()
  }, [])

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-8 text-gray-900 dark:text-gray-100">My Climbing Logbook</h1>
      <div className="bg-white dark:bg-gray-900 p-6 rounded shadow">
        <p className="text-gray-600 dark:text-gray-400">Logbook feature coming soon. {logs.length} logs loaded.</p>
        <button className="mt-4 bg-gray-200 dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-4 py-2 rounded hover:bg-gray-300 dark:hover:bg-gray-700 transition-colors">
          Add New Log
        </button>
      </div>
    </div>
  )
}