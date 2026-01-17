'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import UploadForm from './components/UploadForm'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2 } from 'lucide-react'

export default function UploadPageClient() {
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const checkAuth = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        window.location.href = `/auth?redirect_to=/upload`
      } else {
        setLoading(false)
      }
    }
    checkAuth()
  }, [])

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8 flex justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <Card className="max-w-2xl mx-auto">
        <CardHeader>
          <CardTitle>Upload Climbing Route Photo</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-6 text-gray-600 dark:text-gray-400">
            Upload a GPS-enabled photo to start documenting a new climbing route.
          </p>
          <UploadForm />
        </CardContent>
      </Card>
    </div>
  )
}
