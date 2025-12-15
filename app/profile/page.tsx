'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'

export default function ProfilePage() {
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createClient()
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setUser(user)
      setLoading(false)
    }
    getUser()
  }, [])

  if (loading) {
    return <div className="container mx-auto px-4 py-8">Loading...</div>
  }

  if (!user) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold mb-4">Profile</h1>
          <p className="mb-4">You need to be logged in to view your profile.</p>
          <Link href="/auth/login" className="bg-blue-500 text-white px-4 py-2 rounded">
            Login
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-8">Profile</h1>

      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold mb-4">Account Information</h2>
        <div className="space-y-2">
          <p><strong>Email:</strong> {user.email}</p>
          <p><strong>User ID:</strong> {user.id}</p>
          <p><strong>Created:</strong> {new Date(user.created_at).toLocaleDateString()}</p>
        </div>
      </div>

      <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6">
        <Link href="/logbook" className="bg-blue-50 hover:bg-blue-100 p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold mb-2">My Logbook</h3>
          <p className="text-gray-600">View and manage your climbing logbook</p>
        </Link>

        <Link href="/upload" className="bg-green-50 hover:bg-green-100 p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold mb-2">Upload Route</h3>
          <p className="text-gray-600">Add new climbing routes to the map</p>
        </Link>
      </div>
    </div>
  )
}