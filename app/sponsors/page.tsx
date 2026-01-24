import type { Metadata } from 'next'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { getSponsorMetrics } from '@/lib/posthog-server'
import { getRegisteredUserCount } from '@/lib/supabase-server'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Sponsor Report & Metrics | gsyrocks',
  description: 'Monthly engagement metrics and sponsor report for gsyrocks. View our community growth, user engagement, and sponsorship opportunities for climbing brands.',
  keywords: ['sponsor report', 'climbing metrics', 'engagement data', 'sponsorship opportunities', 'climbing platform'],
}

export const revalidate = 3600

export default async function SponsorsPage() {
  const [registeredUsers, metrics] = await Promise.all([
    getRegisteredUserCount(),
    getSponsorMetrics(),
  ])

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">
          gsyrocks Sponsor Report
        </h1>
        <p className="text-lg text-gray-600 dark:text-gray-400">
          Monthly engagement metrics for potential sponsors and partners
        </p>
      </div>

      <section className="mb-8">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">
          Key Metrics
        </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <MetricCard
              label="Monthly Active Users"
              value={metrics.mau}
              description="Unique users in last 30 days"
            />
            <MetricCard
              label="Daily Active Users"
              value={metrics.dau}
              description="Unique users today"
            />
            <MetricCard
              label="Events This Month"
              value={metrics.eventsThisMonth}
              description="Total interactions tracked"
            />
            <MetricCard
              label="Registered Users"
              value={registeredUsers}
              description="Accounts created"
            />
            <MetricCard
              label="Tracked Users"
              value={metrics.trackedUsers}
              description="Activity tracked"
            />
          </div>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">
          Top User Actions
        </h2>
        <Card>
          <CardHeader>
            <CardTitle>Most Common Interactions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {metrics.topEvents.map((item, index) => (
                <div key={item.event} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-gray-500 w-6">
                      {index + 1}.
                    </span>
                    <span className="text-gray-900 dark:text-gray-100">
                      {formatEventName(item.event)}
                    </span>
                  </div>
                  <span className="text-sm text-gray-600 dark:text-gray-400">
                    {item.count.toLocaleString()} events
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="mb-8">
        <Card>
          <CardHeader>
            <CardTitle>About gsyrocks</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-gray-600 dark:text-gray-400">
              gsyrocks is a community-driven bouldering platform built by climbers, for climbers.
              We help climbers discover, log, and share boulder routes worldwide.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-2">Our Mission</h4>
                <ul className="list-disc list-inside text-gray-600 dark:text-gray-400 space-y-1">
                  <li>Document bouldering locations and their history</li>
                  <li>Make route information accessible to everyone</li>
                  <li>Enable democratic grade consensus</li>
                  <li>Help climbers track their progress</li>
                </ul>
              </div>
              <div>
                <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-2">Our Community</h4>
                <ul className="list-disc list-inside text-gray-600 dark:text-gray-400 space-y-1">
                  <li>Free and open to use</li>
                  <li>Community-contributed route data</li>
                  <li>Privacy-focused analytics</li>
                  <li>Cross-platform accessibility</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="mb-8">
        <Card>
          <CardHeader>
            <CardTitle>Sponsorship Opportunities</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-gray-600 dark:text-gray-400">
              Partner with gsyrocks to reach an engaged audience of climbing enthusiasts.
              Our platform offers targeted visibility for climbing-related brands and local businesses.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-1">Brand Awareness</h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Reach {metrics.mau}+ monthly active users with your message
                </p>
              </div>
              <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-1">Community Trust</h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Associate with a trusted, privacy-respecting platform
                </p>
              </div>
              <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-1">Targeted Reach</h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Connect with serious climbers in your region
                </p>
              </div>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Interested in sponsoring gsyrocks?{' '}
              <a href="https://discord.gg/vzAEMr2qrY" target="_blank" rel="noopener noreferrer" className="underline hover:no-underline">
                Join our Discord server
              </a>
              .
            </p>
          </CardContent>
        </Card>
      </section>
    </div>
  )
}

function MetricCard({
  label,
  value,
  description,
}: {
  label: string
  value: string
  description: string
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">{label}</p>
        <p className="text-3xl font-bold text-gray-900 dark:text-gray-100">{value}</p>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{description}</p>
      </CardContent>
    </Card>
  )
}

function formatEventName(event: string): string {
  const eventNames: Record<string, string> = {
    '$pageview': 'Page Views',
    '$autocapture': 'User Interactions',
    'climb_logged': 'Climbs Logged',
    'route_clicked': 'Routes Viewed',
    'search_performed': 'Searches',
    'search_result_clicked': 'Search Clicks',
    'upload_started': 'Photo Uploads Started',
    'upload_completed': 'Photo Uploads Completed',
    'route_submitted': 'Routes Submitted',
    'auth_login_attempted': 'Login Attempts',
    'auth_login_success': 'Successful Logins',
  }

  return eventNames[event] || event.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}
