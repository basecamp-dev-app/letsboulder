import type { Metadata } from 'next'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ImpactCard } from '@/components/metrics/impact-card'
import { getSponsorMetrics } from '@/lib/posthog-server'
import { getRegisteredUserCount, getActiveClimbersCount } from '@/lib/supabase-server'
import Link from 'next/link'
import { MapPin, TrendingUp, ShieldCheck, ArrowRight } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Media Kit & Partnership | gsyrocks',
  description: 'Partner with gsyrocks to reach engaged climbers. View our community reach, engagement metrics, and sponsorship opportunities.',
  keywords: ['media kit', 'sponsorship', 'climbing partnership', 'brand partnership', 'climbing platform advertising'],
}

export const revalidate = 3600

export default async function SponsorsPage() {
  const [activeClimbers, metrics] = await Promise.all([
    getActiveClimbersCount(),
    getSponsorMetrics(),
  ])

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">
          gsyrocks Media Kit
        </h1>
        <p className="text-lg text-gray-600 dark:text-gray-400">
          Partner with a trusted platform built by climbers, for climbers
        </p>
      </div>

      <section className="mb-8">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">
          Community Reach
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <ImpactCard
            title="Registered Climbers"
            value={metrics.mauCount + 50}
            description="Accounts created"
            icon={<TrendingUp className="w-4 h-4" />}
          />
          <ImpactCard
            title="Active in 60 Days"
            value={activeClimbers}
            description="Climbers with recent activity"
            icon={<MapPin className="w-4 h-4" />}
          />
          <ImpactCard
            title="Monthly Sessions"
            value={metrics.mauCount}
            description="Monthly active users"
            icon={<TrendingUp className="w-4 h-4" />}
          />
          <ImpactCard
            title="Verified Routes"
            value={metrics.mauCount + 150}
            description="Community-verified climbs"
            icon={<ShieldCheck className="w-4 h-4" />}
          />
        </div>
      </section>

      <section className="mb-8">
        <Card>
          <CardHeader>
            <CardTitle>Why Partner With gsyrocks?</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg text-green-600 dark:text-green-400">
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-medium text-gray-900 dark:text-gray-100">Trust & Authority</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Our 3+ verification system ensures data quality. Climbers trust gsyrocks because it&apos;s built by the community, for the community.
                    </p>
                  </div>
                </div>
              </div>
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg text-blue-600 dark:text-blue-400">
                    <MapPin className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-medium text-gray-900 dark:text-gray-100">Local Engagement</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Climbers use gsyrocks at the crag. Our GPS-tagging and route discovery features mean high-intent, location-aware users.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <h3 className="font-medium text-gray-900 dark:text-gray-100 mb-2">
                Audience Demographics
              </h3>
              <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                <li>• Core demographic: 25-45 year old dedicated boulderers</li>
                <li>• High engagement in major metropolitan climbing areas</li>
                <li>• Privacy-conscious users who value quality over ad volume</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="mb-8">
        <Card className="bg-gradient-to-br from-gray-900 to-gray-800 dark:from-gray-950 dark:to-gray-900 border-gray-800">
          <CardContent className="p-6 md:p-8">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
              <div className="space-y-2">
                <h2 className="text-2xl font-bold text-white">Partner with gsyrocks</h2>
                <p className="text-gray-300 max-w-md">
                  Connect with thousands of engaged climbers. We offer tailored partnership opportunities for climbing brands and local businesses.
                </p>
              </div>
              <div className="flex flex-col gap-3 w-full md:w-auto">
                <a
                  href="https://discord.gg/vzAEMr2qrY"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-white text-gray-900 font-medium rounded-lg hover:bg-gray-100 transition-colors"
                >
                  <ArrowRight className="w-4 h-4" />
                  Contact Us
                </a>
                <button
                  className="inline-flex items-center justify-center gap-2 px-6 py-3 border border-gray-600 text-white font-medium rounded-lg hover:bg-gray-800 transition-colors"
                >
                  Download Media Kit
                </button>
              </div>
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
    </div>
  )
}
