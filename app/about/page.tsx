'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default function AboutPage() {
  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl">
      <div className="space-y-8 text-gray-900 dark:text-gray-300">
        <section>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-4">
            About letsboulder
          </h1>
          <p className="text-xl text-gray-600 dark:text-gray-400">
            Discover, log, and share Guernsey bouldering routes. A community-driven platform built by climbers, for climbers.
          </p>
        </section>

        <Card>
          <CardHeader>
            <CardTitle>Our Mission</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="leading-relaxed">
              We started by documenting local Guernsey boulders and are expanding over time while preserving route history and helping climbers improve.
            </p>
            <ul className="list-disc list-inside space-y-2 ml-2">
              <li>Document bouldering locations and their history</li>
              <li>Make route information accessible to everyone</li>
              <li>Enable democratic grade consensus through community input</li>
              <li>Help climbers track their personal progress</li>
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
              <li><strong>See where you rank</strong> on the leaderboard</li>
            </ol>
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
              <li>Gender-segmented leaderboards for fair competition</li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>FAQ</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h4 className="font-medium text-gray-900 dark:text-gray-100">Is this free?</h4>
              <p className="text-sm text-gray-600 dark:text-gray-400">Yes, letsboulder is completely free to use.</p>
            </div>
            <div>
              <h4 className="font-medium text-gray-900 dark:text-gray-100">How accurate are the grades?</h4>
              <p className="text-sm text-gray-600 dark:text-gray-400">Grades reflect community consensus. If you disagree, you can suggest corrections through our contribute process.</p>
            </div>
            <div>
              <h4 className="font-medium text-gray-900 dark:text-gray-100">Can I use it offline?</h4>
              <p className="text-sm text-gray-600 dark:text-gray-400">No, an internet connection is required to access the map and sync your logbook.</p>
            </div>
            <div>
              <h4 className="font-medium text-gray-900 dark:text-gray-100">How is my data used?</h4>
              <p className="text-sm text-gray-600 dark:text-gray-400">Your data is used only to power your personal logbook and the public leaderboard. We don&apos;t sell or share your information.</p>
            </div>
              <div>
                <h4 className="font-medium text-gray-900 dark:text-gray-100">Can I delete my data?</h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">Yes, from Settings &gt; Privacy &gt; Delete account</p>
              </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
