'use client'

import { useState } from 'react'
import { User } from '@supabase/supabase-js'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

interface SponsorshipSectionProps {
  user: User
}

export function SponsorshipSection({ user }: SponsorshipSectionProps) {
  const [loading, setLoading] = useState(false)

  const handleOpenPostHog = async () => {
    setLoading(true)
    try {
      window.open('https://app.posthog.com', '_blank')
    } catch (error) {
      console.error('Failed to open PostHog:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sponsorship & Analytics</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
          <h4 className="font-medium text-blue-900 dark:text-blue-100 mb-2">
            Analytics for Sponsors
          </h4>
          <p className="text-sm text-blue-700 dark:text-blue-300 mb-4">
            We use PostHog to track app usage and generate sponsorship reports. 
            This helps demonstrate engagement to potential sponsors.
          </p>
          <div className="space-y-2 text-sm text-blue-600 dark:text-blue-400">
            <p>• Active users (DAU/MAU)</p>
            <p>• Feature adoption metrics</p>
            <p>• Community contributions (UGC)</p>
            <p>• Conversion funnels</p>
          </div>
        </div>

        <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
          <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-2">
            Data We Track
          </h4>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
            To build sponsorship reports, we track:
          </p>
          <div className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
            <p>• Page views and feature usage</p>
            <p>• Climb logging activity</p>
            <p>• Route submissions</p>
            <p>• Search and discovery patterns</p>
            <p>• User accounts and retention</p>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-500 mt-3">
            We never share personally identifiable information with sponsors.
            All data is aggregated and anonymized.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <Button
            variant="outline"
            onClick={handleOpenPostHog}
            disabled={loading}
            className="flex-1"
          >
            {loading ? 'Opening...' : 'View Analytics Dashboard'}
          </Button>
        </div>

        <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
          Logged in as {user.email} • PostHog analytics powered • Free tier (1M events/month)
        </p>
      </CardContent>
    </Card>
  )
}
