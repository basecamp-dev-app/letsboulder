export default function PrivacyPage() {
  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl">
      <h1 className="text-3xl font-bold mb-8 text-gray-900 dark:text-gray-100">
        Privacy Policy
      </h1>

      <div className="prose dark:prose-invert max-w-none">
        <p className="text-gray-600 dark:text-gray-400 mb-6">
          <strong>Last Updated:</strong> January 2025
        </p>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-gray-100">
            1. Introduction
          </h2>
          <p className="text-gray-700 dark:text-gray-300">
            Welcome to gsyrocks. We are a bouldering logbook web application that helps climbers in Guernsey track their ascents, discover new climbs, and compete on leaderboards.
          </p>
          <p className="text-gray-700 dark:text-gray-300 mt-2">
            This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our website and services.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-gray-100">
            2. Information We Collect
          </h2>

          <h3 className="text-lg font-medium mb-2 text-gray-900 dark:text-gray-100">
            2.1 Information You Provide Directly
          </h3>
          <p className="text-gray-700 dark:text-gray-300 mb-2">
            <strong>Account Information:</strong> Email address, username, profile picture, first/last name (optional), gender (optional)
          </p>
          <p className="text-gray-700 dark:text-gray-300">
            <strong>Climbing Data:</strong> Climbs you log (grade, status, date, location), photos you upload, crag information you add
          </p>

          <h3 className="text-lg font-medium mt-4 mb-2 text-gray-900 dark:text-gray-100">
            2.2 Information Collected Automatically
          </h3>
          <p className="text-gray-700 dark:text-gray-300">
            Usage data, IP address, browser type, operating system, cookies, and similar tracking technologies
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-gray-100">
            3. How We Use Your Information
          </h2>
          <ul className="list-disc pl-5 text-gray-700 dark:text-gray-300 space-y-1">
            <li>Create and manage your account</li>
            <li>Record and display your climbing logbook</li>
            <li>Show your climbing statistics and progress</li>
            <li>Display your profile on leaderboards</li>
            <li>Allow you to search and discover climbs on the map</li>
            <li>Enable you to contribute new climbs and crag information</li>
            <li>Improve our services and analyze usage patterns</li>
            <li>Comply with legal obligations</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-gray-100">
            4. Information Sharing
          </h2>

          <h3 className="text-lg font-medium mb-2 text-gray-900 dark:text-gray-100">
            4.1 Public Information
          </h3>
          <p className="text-gray-700 dark:text-gray-300">
            Your username, profile picture (if uploaded), and climbing statistics are displayed publicly on leaderboards.
          </p>

          <h3 className="text-lg font-medium mt-4 mb-2 text-gray-900 dark:text-gray-100">
            4.2 Service Providers
          </h3>
          <p className="text-gray-700 dark:text-gray-300">
            We use Supabase for authentication/database and Vercel for hosting. These services have access to information necessary to perform their functions.
          </p>

          <h3 className="text-lg font-medium mt-4 mb-2 text-gray-900 dark:text-gray-100">
            4.3 Legal Requirements
          </h3>
          <p className="text-gray-700 dark:text-gray-300">
            We may disclose information if required by law or to protect our rights and safety.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-gray-100">
            5. Data Security
          </h2>
          <p className="text-gray-700 dark:text-gray-300">
            We implement appropriate technical and organizational measures to protect your information. However, no method of transmission over the Internet is 100% secure.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-gray-100">
            6. Data Retention
          </h2>
          <p className="text-gray-700 dark:text-gray-300">
            We retain your information for as long as your account is active. You may delete your logged climbs at any time. After account deletion, your data is removed within 30 days.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-gray-100">
            7. Your Rights
          </h2>
          <ul className="list-disc pl-5 text-gray-700 dark:text-gray-300 space-y-1">
            <li>Access and correct your personal information</li>
            <li>Request deletion of your account and data</li>
            <li>Opt out of leaderboard display (leave username blank)</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-gray-100">
            8. Cookies
          </h2>
          <p className="text-gray-700 dark:text-gray-300">
            We use cookies for authentication, preferences, and analytics. You can control cookies through your browser settings.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-gray-100">
            9. Children&apos;s Privacy
          </h2>
          <p className="text-gray-700 dark:text-gray-300">
            gsyrocks is not intended for children under 13. We do not knowingly collect information from children under 13.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-gray-100">
            10. Changes to This Policy
          </h2>
          <p className="text-gray-700 dark:text-gray-300">
            We may update this policy from time to time. We will notify you of material changes by posting the new policy on this page.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-gray-100">
            11. Contact Us
          </h2>
          <p className="text-gray-700 dark:text-gray-300">
            If you have questions about this Privacy Policy, please contact us at{' '}
            <a href="mailto:hello@gsyrocks.com" className="underline">
              hello@gsyrocks.com
            </a>
          </p>
        </section>
      </div>
    </div>
  )
}
