'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase'

interface Climb {
  id: string
  name: string
  grade: string
  description: string
  image_url: string
  coordinates: any
  crags: { name: string }
  profiles: { email: string }
}

interface PendingClimbsProps {
  initialClimbs: Climb[]
}

export default function PendingClimbs({ initialClimbs }: PendingClimbsProps) {
  const [climbs, setClimbs] = useState(initialClimbs)

  const handleApprove = async (climbId: string) => {
    try {
      const supabase = createClient()
      const { error } = await supabase
        .from('climbs')
        .update({ status: 'approved', approved_at: new Date().toISOString() })
        .eq('id', climbId)

      if (error) throw error

      // TODO: Send approval email

      setClimbs(prev => prev.filter(c => c.id !== climbId))
    } catch (error) {
      console.error('Approval error:', error)
      alert('Failed to approve')
    }
  }

  const handleReject = async (climbId: string) => {
    const reason = prompt('Reason for rejection:')
    if (!reason) return

    try {
      const supabase = createClient()
      const { error } = await supabase
        .from('climbs')
        .update({ status: 'rejected', rejected_reason: reason })
        .eq('id', climbId)

      if (error) throw error

      // TODO: Send rejection email

      setClimbs(prev => prev.filter(c => c.id !== climbId))
    } catch (error) {
      console.error('Rejection error:', error)
      alert('Failed to reject')
    }
  }

  if (climbs.length === 0) {
    return <p>No pending climbs to review.</p>
  }

  return (
    <div className="space-y-6">
      {climbs.map(climb => (
        <div key={climb.id} className="border border-gray-200 dark:border-gray-700 rounded p-4 bg-white dark:bg-gray-900">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100">{climb.name}</h3>
              <p className="text-gray-600 dark:text-gray-400">Grade: {climb.grade}</p>
              <p className="text-gray-600 dark:text-gray-400">Crag: {climb.crags.name}</p>
              <p className="text-gray-600 dark:text-gray-400">Submitted by: {climb.profiles.email}</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => handleApprove(climb.id)}
                className="bg-gray-200 dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-4 py-2 rounded hover:bg-gray-300 dark:hover:bg-gray-700 transition-colors"
              >
                Approve
              </button>
              <button
                onClick={() => handleReject(climb.id)}
                className="bg-gray-200 dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-4 py-2 rounded hover:bg-gray-300 dark:hover:bg-gray-700 transition-colors"
              >
                Reject
              </button>
            </div>
          </div>
          {climb.description && <p className="mb-4 text-gray-700 dark:text-gray-300">{climb.description}</p>}
          <img src={climb.image_url} alt={climb.name} className="w-full h-auto rounded" />
        </div>
      ))}
    </div>
  )
}