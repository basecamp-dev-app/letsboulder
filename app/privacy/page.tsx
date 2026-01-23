import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Privacy Policy | gsyrocks',
  description: 'Learn how gsyrocks collects, uses, and protects your personal information. Our privacy policy covers data collection, cookies, analytics, and your privacy rights.',
  keywords: ['privacy policy', 'data protection', 'GDPR', 'cookie policy', 'personal data'],
}

export default function PrivacyPage() {
  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl">
      <h1 className="text-3xl font-bold mb-8 text-gray-900 dark:text-gray-100">
        Privacy Policy
      </h1>

      <div className="prose dark:prose-invert max-w-none">
        <p className="text-gray-600 dark:text-gray-400 mb-6">
          <strong>Last Updated:</strong> January 2026
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
            Usage data, IP address, browser type, operating system, cookies, and similar tracking technologies. We use PostHog, a privacy-first analytics service, to help us understand how users interact with our app.
          </p>

          <h3 className="text-lg font-medium mt-4 mb-2 text-gray-900 dark:text-gray-100">
            2.3 Location Data
          </h3>
          <p className="text-gray-700 dark:text-gray-300 mb-2">
            We collect location information for climbing routes and crags:
          </p>
          <ul className="list-disc pl-5 text-gray-700 dark:text-gray-300 mt-2 space-y-1 mb-4">
            <li>GPS coordinates from uploaded photos (extracted from EXIF metadata)</li>
            <li>Crag locations you add or verify</li>
            <li>Your default location preference (stored in account settings)</li>
            <li>Map interaction data for route discovery</li>
          </ul>
          <p className="text-gray-700 dark:text-gray-300">
            Location data is displayed publicly on our interactive map and is essential
            to the core functionality of gsyrocks.
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
            We use Supabase for authentication/database, Vercel for hosting, and PostHog for analytics. These services have access to information necessary to perform their functions.
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
            <li>Download a copy of your data at any time through your account settings</li>
            <li>Opt out of leaderboard display (leave username blank)</li>
          </ul>
          <p className="text-gray-700 dark:text-gray-300 mt-4">
            Your data will be permanently removed within 30 days of account deletion.
          </p>

          <h3 className="text-lg font-medium mt-6 mb-2 text-gray-900 dark:text-gray-100">
            7.1 Additional Rights (GDPR - EU/EEA Users)
          </h3>
          <p className="text-gray-700 dark:text-gray-300 mb-4">
            If you are located in the European Union or European Economic Area, you
            have additional rights under the General Data Protection Regulation (GDPR):
          </p>
          <ul className="list-disc pl-5 text-gray-700 dark:text-gray-300 mt-2 space-y-1 mb-4">
            <li><strong>Right of Access:</strong> You can request a copy of all personal
              data we hold about you</li>
            <li><strong>Right to Rectification:</strong> You can request correction of
              inaccurate or incomplete personal data</li>
            <li><strong>Right to Erasure:</strong> You can request deletion of your
              account and all associated data</li>
            <li><strong>Right to Restriction of Processing:</strong> You can request
              that we limit how we use your data</li>
            <li><strong>Right to Data Portability:</strong> You can request a copy of
              your data in a machine-readable format</li>
            <li><strong>Right to Object:</strong> You can object to processing based
              on legitimate interests or direct marketing</li>
          </ul>
          <p className="text-gray-700 dark:text-gray-300">
            To exercise any of these rights, contact us at hello@gsyrocks.com.
            We will respond within 30 days.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-gray-100">
            8. Cookies
          </h2>
          <p className="text-gray-700 dark:text-gray-300">
            We use cookies for authentication, preferences, and analytics through third-party services including PostHog. You can control cookies through your browser settings.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-gray-100">
            9. Analytics
          </h2>
          <p className="text-gray-700 dark:text-gray-300">
            We use PostHog, a privacy-respecting analytics tool, to understand how users interact with our application. PostHog helps us improve our services by showing us aggregate usage patterns. PostHog does not sell your data and is configured to minimize personal information collection.
          </p>
          <p className="text-gray-700 dark:text-gray-300 mt-2">
            You can opt out of analytics tracking by contacting us at hello@gsyrocks.com.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-gray-100">
            10. Children&apos;s Privacy
          </h2>
          <p className="text-gray-700 dark:text-gray-300">
            gsyrocks is not intended for children under 13. We do not knowingly collect information from children under 13.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-gray-100">
            11. Changes to This Policy
          </h2>
          <p className="text-gray-700 dark:text-gray-300">
            We may update this policy from time to time. We will notify you of material changes by posting the new policy on this page.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-gray-100">
            12. Contact Us
          </h2>
          <p className="text-gray-700 dark:text-gray-300 mb-2">
            gsyrocks is operated by:
          </p>
          <p className="text-gray-700 dark:text-gray-300 font-medium mb-4">
            GSYROCKS LTD<br />
            Guernsey, Channel Islands
          </p>
          <p className="text-gray-700 dark:text-gray-300">
            If you have questions about this Privacy Policy or your data, please contact us at{' '}
            <a href="mailto:hello@gsyrocks.com" className="underline">
              hello@gsyrocks.com
            </a>
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-gray-100">
            13. International Data Transfers
          </h2>

          <h3 className="text-lg font-medium mb-2 text-gray-900 dark:text-gray-100">
            13.1 Data Storage Location
          </h3>
          <p className="text-gray-700 dark:text-gray-300 mb-4">
            Your personal data is primarily stored and processed in the European Union
            through Supabase&apos;s EU-based infrastructure.
          </p>

          <h3 className="text-lg font-medium mb-2 text-gray-900 dark:text-gray-100">
            13.2 Analytics Transfers
          </h3>
          <p className="text-gray-700 dark:text-gray-300 mb-4">
            PostHog processes analytics data in the United States under Standard
            Contractual Clauses (SCCs) approved by the European Commission.
          </p>

          <h3 className="text-lg font-medium mb-2 text-gray-900 dark:text-gray-100">
            13.3 UK Adequacy
          </h3>
          <p className="text-gray-700 dark:text-gray-300 mb-4">
            For users in the United Kingdom, data transfers comply with UK data
            protection laws and UK adequacy decisions for EU/US data transfers.
          </p>

          <h3 className="text-lg font-medium mb-2 text-gray-900 dark:text-gray-100">
            13.4 Data Protection
          </h3>
          <p className="text-gray-700 dark:text-gray-300">
            We ensure adequate protections are in place when transferring data outside
            the EU/UK, including SCCs and other appropriate safeguards as required
            by applicable data protection laws.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-gray-100">
            14. California Privacy Rights
          </h2>
          <p className="text-gray-700 dark:text-gray-300 mb-4">
            If you are a California resident, you have specific rights under the
            California Consumer Privacy Act (CCPA):
          </p>

          <h3 className="text-lg font-medium mb-2 text-gray-900 dark:text-gray-100">
            14.1 Information We Collect
          </h3>
          <p className="text-gray-700 dark:text-gray-300 mb-4">
            We collect the following categories of personal information:
          </p>
          <ul className="list-disc pl-5 text-gray-700 dark:text-gray-300 mt-2 space-y-1 mb-4">
            <li>Identifiers (username, email, IP address)</li>
            <li>Geolocation data (GPS coordinates from uploads)</li>
            <li>Activity data (climbs logged, routes submitted)</li>
            <li>Profile information</li>
          </ul>

          <h3 className="text-lg font-medium mb-2 text-gray-900 dark:text-gray-100">
            14.2 Your Rights
          </h3>
          <ul className="list-disc pl-5 text-gray-700 dark:text-gray-300 mt-2 space-y-1 mb-4">
            <li>Right to know what personal information we collect</li>
            <li>Right to request deletion of your personal information</li>
            <li>Right to opt-out of sale of personal information (we do not sell data)</li>
            <li>Right to non-discrimination for exercising your rights</li>
          </ul>

          <h3 className="text-lg font-medium mb-2 text-gray-900 dark:text-gray-100">
            14.3 Do Not Sell
          </h3>
          <p className="text-gray-700 dark:text-gray-300 mb-4">
            gsyrocks does not sell your personal information to third parties.
          </p>

          <h3 className="text-lg font-medium mb-2 text-gray-900 dark:text-gray-100">
            14.4 Exercise Your Rights
          </h3>
          <p className="text-gray-700 dark:text-gray-300">
            To submit a request, email hello@gsyrocks.com with &quot;CCPA Request&quot; in
            the subject line. We will verify your identity before processing.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-gray-100">
            15. Image Retention After Deletion
          </h2>

          <h3 className="text-lg font-medium mb-2 text-gray-900 dark:text-gray-100">
            15.1 Deletion Options
          </h3>
          <p className="text-gray-700 dark:text-gray-300 mb-4">
            When you delete your account, you may choose:
          </p>
          <ul className="list-disc pl-5 text-gray-700 dark:text-gray-300 mt-2 space-y-1 mb-4">
            <li>Delete my account and all my image uploads</li>
            <li>Delete my account but keep my image uploads (attributed to &quot;[anonymous]&quot;)</li>
          </ul>

          <h3 className="text-lg font-medium mb-2 text-gray-900 dark:text-gray-100">
            15.2 Third-Party Content
          </h3>
          <p className="text-gray-700 dark:text-gray-300 mb-4">
            If you have shared images from gsyrocks to social media or other platforms:
          </p>
          <ul className="list-disc pl-5 text-gray-700 dark:text-gray-300 mt-2 space-y-1 mb-4">
            <li>We cannot remove images from those platforms</li>
            <li>We cannot delete cached copies or reposts</li>
            <li>You are responsible for contacting those platforms directly</li>
          </ul>

          <h3 className="text-lg font-medium mb-2 text-gray-900 dark:text-gray-100">
            15.3 Retention Period
          </h3>
          <p className="text-gray-700 dark:text-gray-300">
            Images retained on gsyrocks after account deletion remain visible until:
          </p>
          <ul className="list-disc pl-5 text-gray-700 dark:text-gray-300 mt-2 space-y-1">
            <li>You subsequently request their removal</li>
            <li>Content is removed for policy violations</li>
            <li>gsyrocks ceases operations</li>
          </ul>
        </section>
      </div>
    </div>
  )
}
