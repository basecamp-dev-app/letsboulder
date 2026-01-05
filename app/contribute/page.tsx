'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

export default function ContributePage() {
  const [user, setUser] = useState<any>(null)
  const router = useRouter()

  useEffect(() => {
    const supabase = createClient()
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setUser(user)
    }
    getUser()
  }, [])

  const handleStartContributing = async () => {
    if (!user) {
      router.push('/auth')
    } else {
      router.push('/upload')
    }
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-8">Contribute to Gsyrocks</h1>
      
      <div className="bg-white rounded-xl shadow-lg p-6 max-w-md mx-auto">
        <div className="text-center space-y-4 mb-8">
          <p className="text-lg text-gray-700">Take photos of missing climbs</p>
          <p className="text-lg text-gray-700">Report errors</p>
        </div>
        
        <button
          onClick={handleStartContributing}
          className="w-full bg-blue-600 text-white py-3 px-6 rounded-lg font-semibold hover:bg-blue-700 transition-colors mb-3"
        >
          Start Contributing
        </button>
        
        <a
          href="mailto:hello@gsyrocks.com"
          className="block w-full bg-gray-200 text-gray-800 py-3 px-6 rounded-lg font-semibold hover:bg-gray-300 transition-colors text-center mb-3"
        >
          Feedback
        </a>
        
        <Link
          href="/about"
          className="block w-full bg-gray-100 text-gray-800 py-3 px-6 rounded-lg font-semibold hover:bg-gray-200 transition-colors text-center"
        >
          Learn More About Gsyrocks
        </Link>
      </div>
    </div>
  )
}
