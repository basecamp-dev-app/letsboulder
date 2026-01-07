'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

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
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-8">Contribute to Gsyrocks</h1>
      
      <Card className="max-w-md mx-auto">
        <CardHeader>
          <CardTitle className="text-center">Help Grow the Database</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-center text-gray-600 dark:text-gray-400">
            Take photos of missing climbs or report errors to help improve the database for everyone.
          </p>
          
          <Button
            onClick={handleStartContributing}
            className="w-full"
          >
            Start Contributing
          </Button>
          
          <a
            href="mailto:hello@gsyrocks.com"
            className="block w-full bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 py-3 px-6 rounded-lg font-semibold hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors text-center"
          >
            Feedback
          </a>
          
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
