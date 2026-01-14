'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { User } from '@supabase/supabase-js'

export default function UploadClimbPage() {
  const [user, setUser] = useState<User | null>(null)
  const router = useRouter()

  useEffect(() => {
    const supabase = createClient()
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setUser(user)
    }
    getUser()
  }, [])

  const handleStartUpload = async () => {
    if (!user) {
      router.push('/auth')
    } else {
      router.push('/submit')
    }
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-8">Upload a Climb</h1>

      <Card className="max-w-md mx-auto">
        <CardHeader>
          <CardTitle className="text-center">Share Your Climbs</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-center text-gray-600 dark:text-gray-400">
            Take photos of new routes or report errors to help grow the database for everyone.
          </p>

          <Button
            onClick={handleStartUpload}
            className="w-full"
          >
            Upload a Climb
          </Button>

          <Link
            href="/about"
            className="block w-full bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 py-3 px-6 rounded-lg font-semibold hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors text-center"
          >
            Learn More About Gsyrocks
          </Link>
        </CardContent>
      </Card>
    </div>
  )
}
