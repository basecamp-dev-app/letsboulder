'use client'

import SupportCard from '@/components/SupportCard'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default function AboutPage() {
  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl">
      <div className="space-y-8 text-gray-900 dark:text-gray-300">
        <section>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-4">
            About letsboulder
          </h1>
          <p className="text-base text-gray-600 dark:text-gray-400">
            letsboulder is a community climbing map, logbook, and field guide built to stay genuinely useful: fast to open, easy to contribute to, and free for everyone.
          </p>
        </section>

        <Card>
          <CardHeader>
            <CardTitle>Our Mission</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <ul className="list-disc list-inside space-y-2 ml-2">
              <li>Document bouldering locations and their history</li>
              <li>Make route information accessible to everyone</li>
              <li>Help climbers track their personal progress</li>
              <li>Keep the app free, ad-free, and community-first</li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>How It Works</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="list-decimal list-inside space-y-3">
              <li><strong>Find climbs</strong> on our interactive satellite map</li>
              <li><strong>Log your ascents</strong> — flash, top, or try</li>
              <li><strong>Track progress</strong> with grade history and pyramids</li>
            </ol>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Why it stays free</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-gray-700 dark:text-gray-300">
            <p>
              The goal is simple: make a climbing tool people actually want to come back to, without locking basic features behind a paywall.
            </p>
            <p>
              If letsboulder helps you discover climbs, log sessions, or share knowledge with other climbers, you can support the project voluntarily. If not, keep using it anyway.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Community Features</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc list-inside space-y-2">
              <li>Submit and name new routes</li>
              <li>Contribute photos of climbs</li>
              <li>Report errors or suggest corrections</li>
            </ul>
          </CardContent>
        </Card>

        <SupportCard />
      </div>
    </div>
  )
}
