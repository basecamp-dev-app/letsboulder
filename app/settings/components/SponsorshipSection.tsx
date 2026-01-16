'use client'

import { User } from '@supabase/supabase-js'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import Link from 'next/link'

interface SponsorshipSectionProps {
  user: User
}

export function SponsorshipSection({ user }: SponsorshipSectionProps) {
  return (
    <Card id="sponsorship">
      <CardHeader>
        <CardTitle>Sponsorship & Analytics</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
          <h4 className="font-medium text-blue-900 dark:text-blue-100 mb-2">
            Sponsor Report
          </h4>
          <p className="text-sm text-blue-700 dark:text-blue-300 mb-3">
            We use PostHog to track app usage and generate sponsorship reports.
            This helps demonstrate engagement to potential sponsors.
          </p>
          <Link href="/sponsors" className="text-sm font-medium text-blue-700 dark:text-blue-300 hover:underline">
            View Sponsor Report →
          </Link>
        </div>

        <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
          <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-2">
            Data We Track
          </h4>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
            We track aggregate engagement metrics for sponsorship reporting:
          </p>
          <div className="grid grid-cols-2 gap-2 text-sm text-gray-600 dark:text-gray-400">
            <p>• Active users (DAU/MAU)</p>
            <p>• Feature adoption</p>
            <p>• Community contributions</p>
            <p>• Conversion funnels</p>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-500 mt-3">
            We never share personally identifiable information with sponsors.
          </p>
        </div>

        <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
          Logged in as {user.email} • PostHog analytics powered
        </p>
      </CardContent>
    </Card>
  )
}
