import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'Learn how letsboulder collects, uses, stores, and shares personal data, including account, location, image, and community activity information.',
  keywords: ['privacy policy', 'data protection', 'GDPR', 'CCPA', 'cookies'],
}

export default function PrivacyPage() {
  return (
    <div className="container mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-8 text-3xl font-bold text-gray-900 dark:text-gray-100">
        Privacy Policy
      </h1>

      <div className="prose max-w-none dark:prose-invert">
        <p className="mb-6 text-gray-600 dark:text-gray-400">
          <strong>Last Updated:</strong> April 2026
        </p>

        <section className="mb-8 rounded-2xl border border-gray-200 bg-gray-50 p-5 dark:border-gray-800 dark:bg-gray-900/50">
          <h2 className="mt-0 text-xl font-semibold text-gray-900 dark:text-gray-100">
            Summary
          </h2>
          <ul className="mb-0 list-disc space-y-1 pl-5 text-gray-700 dark:text-gray-300">
            <li>letsboulder helps climbers log ascents, upload climbing photos, discover routes, and use community features.</li>
            <li>We collect account details, profile details, climbing activity, uploaded media, location-related data, and limited technical and error-monitoring data.</li>
            <li>Some content is public by design, including route submissions, map data, public profiles, and community posts.</li>
            <li>You can ask us to access, correct, delete, or export your personal data by emailing hello@letsboulder.com.</li>
            <li>letsboulder is operated by Patrick William Hadow trading as letsboulder, an individual / sole trader based in the United Kingdom.</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">1. Who We Are</h2>
          <p className="text-gray-700 dark:text-gray-300">
            letsboulder is operated by Patrick William Hadow trading as letsboulder, an individual / sole trader based in the United Kingdom.
          </p>
          <p className="text-gray-700 dark:text-gray-300">
            If you have privacy questions or want to exercise your rights, contact <a href="mailto:hello@letsboulder.com" className="underline">hello@letsboulder.com</a>.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">2. Scope</h2>
          <p className="text-gray-700 dark:text-gray-300">
            This Privacy Policy applies to letsboulder.com, our web app, account services, map features, route submissions, community features, transactional emails, and related support interactions.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">3. Personal Data We Collect</h2>

          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">3.1 Data You Provide Directly</h3>
          <ul className="list-disc space-y-1 pl-5 text-gray-700 dark:text-gray-300">
            <li>Account data such as email address, sign-in method, username, and avatar.</li>
            <li>Profile data such as first name, last name, bio, gender, height, reach, grade preferences, units, theme preference, and contribution credit handles.</li>
            <li>Climbing data such as ascents, grades, votes, verifications, corrections, route submissions, comments, community posts, RSVPs, reports, and flags.</li>
            <li>Uploaded content such as photos, route images, and related text.</li>
          </ul>

          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">3.2 Location and Image Metadata</h3>
          <ul className="list-disc space-y-1 pl-5 text-gray-700 dark:text-gray-300">
            <li>GPS coordinates extracted from image metadata where present.</li>
            <li>Crag and route coordinates that you submit, edit, or verify.</li>
            <li>Default map location preferences saved in your account.</li>
          </ul>
          <p className="text-gray-700 dark:text-gray-300">
            Location information is core to how letsboulder works. If you upload an image with location metadata, that metadata may be used to help place climbing content on the map before metadata is stripped from the stored file.
          </p>

          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">3.3 Data Collected Automatically</h3>
          <ul className="list-disc space-y-1 pl-5 text-gray-700 dark:text-gray-300">
            <li>IP address, browser type, operating system, referral information, timestamps, and request logs.</li>
            <li>Session identifiers, cookies, CSRF/security tokens, local storage values, IndexedDB records, and browser cache data.</li>
            <li>Limited performance and error-monitoring data used to understand reliability.</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">4. How We Use Personal Data</h2>
          <ul className="list-disc space-y-1 pl-5 text-gray-700 dark:text-gray-300">
            <li>To create and secure accounts.</li>
            <li>To run maps, route discovery, logbooks, rankings, and community features.</li>
            <li>To process, display, moderate, and store uploaded climbing content.</li>
            <li>To detect abuse, spam, fraud, unsafe uploads, and policy violations.</li>
            <li>To send transactional emails such as sign-in, welcome, and account deletion confirmations.</li>
            <li>To improve product reliability, performance, usability, and connection handling.</li>
            <li>To comply with legal obligations and resolve disputes.</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">5. Lawful Bases (GDPR / UK GDPR)</h2>
          <p className="text-gray-700 dark:text-gray-300">
            We rely on the following lawful bases where applicable:
          </p>
          <ul className="list-disc space-y-2 pl-5 text-gray-700 dark:text-gray-300">
            <li><strong>Contract:</strong> to provide the letsboulder services you request, including account access, climbing logs, route submissions, and community features.</li>
            <li><strong>Legitimate interests:</strong> to keep letsboulder secure, moderate unsafe or abusive content, maintain route quality, prevent fraud, improve reliability, and maintain important operational audit trails.</li>
            <li><strong>Consent:</strong> where consent is required by law for specific processing activities.</li>
            <li><strong>Legal obligation:</strong> where we must retain or disclose data to comply with law, regulation, or legal claims.</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">6. Public Information</h2>
          <p className="text-gray-700 dark:text-gray-300">
            letsboulder includes public and community-facing features. Depending on your settings and actions, other users or the public may see your username, avatar, public profile details, route submissions, climbing content, comments, community posts, and map-related climbing data.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">7. Sharing and Third Parties</h2>
          <p className="text-gray-700 dark:text-gray-300">We use third-party providers to operate letsboulder, including:</p>
          <ul className="list-disc space-y-1 pl-5 text-gray-700 dark:text-gray-300">
            <li><strong>Supabase</strong> for authentication, database services, and storage.</li>
            <li><strong>Vercel</strong> for hosting and infrastructure.</li>
            <li><strong>Resend</strong> for transactional email delivery.</li>
            <li><strong>Cloudflare</strong> for image storage, processing, and delivery.</li>
            <li><strong>Sentry</strong> for error tracking and performance monitoring.</li>
          </ul>
          <p className="text-gray-700 dark:text-gray-300">
            We may also disclose information where required by law, to respond to legal process, or to protect rights, safety, and the integrity of the service.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">8. Cookies, Local Storage, and Similar Technologies</h2>
          <p className="text-gray-700 dark:text-gray-300">
            We use cookies and similar technologies for authentication, session continuity, security, storing preferences, and error monitoring. We also use local storage, IndexedDB, and normal browser caching for app state, CSRF handling, and selected cached content. Application-level Vercel Analytics and Vercel Speed Insights are not currently initialized.
          </p>
          <p className="text-gray-700 dark:text-gray-300">
            For more detail, see our <Link href="/cookies" className="underline">Cookie Policy</Link> or go directly to <Link href="/cookies#privacy-choices" className="underline">Privacy choices</Link>. You can also control many cookies through your browser settings.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">9. International Transfers</h2>
          <p className="text-gray-700 dark:text-gray-300">
            Your data may be processed in the United Kingdom, European Economic Area, United States, or other countries where our providers operate. Where required, we rely on contractual and other legally recognized safeguards for international transfers used by our providers and hosting partners.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">10. Data Retention</h2>
          <p className="text-gray-700 dark:text-gray-300">
            We keep personal data only for as long as reasonably necessary for the purposes described in this policy. Account and profile data are generally kept while your account is active. Uploaded files, submissions, and community content may be deleted, anonymized, or retained depending on the feature and the deletion option you select.
          </p>
          <p className="text-gray-700 dark:text-gray-300">
            We may retain limited records of deletion requests, completed deletions, security events, moderation decisions, or legal requests where reasonably necessary for compliance, fraud prevention, dispute handling, and service integrity.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">11. Your Privacy Rights</h2>
          <p className="text-gray-700 dark:text-gray-300">
            Depending on your location, you may have rights to access, correct, delete, restrict, object to certain processing, withdraw consent, and request a portable copy of your personal data.
          </p>
          <ul className="list-disc space-y-1 pl-5 text-gray-700 dark:text-gray-300">
            <li><strong>Right to be forgotten:</strong> you can request deletion of your account and associated personal data, subject to lawful exceptions.</li>
            <li><strong>Data portability:</strong> you can request a copy of your personal data in a structured, commonly used, machine-readable format by emailing us.</li>
            <li><strong>Correction:</strong> you can update some profile details in settings and contact us to correct other data.</li>
          </ul>
          <p className="text-gray-700 dark:text-gray-300">
            To exercise your rights, email <a href="mailto:hello@letsboulder.com" className="underline">hello@letsboulder.com</a>. We may need to verify your identity before completing some requests.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">12. Account Deletion</h2>
          <p className="text-gray-700 dark:text-gray-300">
            letsboulder provides an account deletion flow. When you delete your account, we may delete your profile, avatar, account access, and related user records. For route uploads, you may be offered a choice to delete the uploads or keep some content on letsboulder without personal attribution.
          </p>
          <p className="text-gray-700 dark:text-gray-300">
            We may keep limited deletion audit records, including deletion request and completed deletion logs, and other information that must be retained for security, fraud prevention, legal compliance, or dispute resolution.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">13. California Privacy Rights</h2>
          <p className="text-gray-700 dark:text-gray-300">
            If you are a California resident, you may have rights to know, access, correct, delete, and receive information about the categories of personal information we collect, the sources of that information, the purposes for collection, and the categories of recipients.
          </p>
          <p className="text-gray-700 dark:text-gray-300">
            We do not sell personal information for money. To submit a California privacy request, email <a href="mailto:hello@letsboulder.com" className="underline">hello@letsboulder.com</a> with the subject line &quot;California Privacy Request&quot;.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">14. Children&apos;s Privacy</h2>
          <p className="text-gray-700 dark:text-gray-300">
            letsboulder is not directed to children under 13, and we do not knowingly collect personal information from children under 13. If you believe a child has provided personal data to us in violation of this policy, contact us and we will investigate and, where appropriate, delete the data.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">15. Security</h2>
          <p className="text-gray-700 dark:text-gray-300">
            We use reasonable technical and organizational safeguards to protect personal data. No system is completely secure, and we cannot guarantee absolute security.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">16. Changes to This Policy</h2>
          <p className="text-gray-700 dark:text-gray-300">
            We may update this Privacy Policy from time to time. If changes are material, we may post notice in the app or request renewed acceptance before continued use of certain features.
          </p>
        </section>
      </div>
    </div>
  )
}
