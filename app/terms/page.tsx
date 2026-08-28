import type { Metadata } from 'next'
import Link from 'next/link'
import { SOURCE_REPOSITORY_URL } from '@/lib/site'

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'Terms of Service for letsboulder covering user accounts, community content, climbing risk, safety disclaimers, and legal responsibilities.',
  keywords: ['terms of service', 'terms and conditions', 'user agreement', 'climbing safety'],
}

export default function TermsPage() {
  return (
    <div className="container mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-8 text-3xl font-bold text-gray-900 dark:text-gray-100">
        Terms of Service
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
            <li>letsboulder is a climbing map, logbook, route submission, and community platform.</li>
            <li>Climbing is inherently dangerous, and information on letsboulder may be incomplete, inaccurate, or out of date.</li>
            <li>You are responsible for your own safety, access checks, partners, equipment, and decisions.</li>
            <li>You keep ownership of content you upload. Public contributions are shared under the licenses in the Open Data Contributor Terms.</li>
            <li>We may remove content, suspend accounts, or restrict access to protect users, landowners, and the platform.</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">1. Operator</h2>
          <p className="text-gray-700 dark:text-gray-300">
            These Terms are a legal agreement between you and Patrick William Hadow trading as letsboulder, an individual / sole trader based in the United Kingdom.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">2. Acceptance and Eligibility</h2>
          <p className="text-gray-700 dark:text-gray-300">
            By accessing or using letsboulder, you agree to these Terms. If you do not agree, do not use the service.
          </p>
          <p className="text-gray-700 dark:text-gray-300">
            letsboulder is not intended for children under 13. If local law requires a higher digital consent age, you must meet that age or use the service only with valid parent or guardian authorization.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">3. The Service</h2>
          <p className="text-gray-700 dark:text-gray-300">
            letsboulder provides climbing maps, route beta, logbooks, rankings, route submissions, images, and community features for climbers.
          </p>
          <p className="text-gray-700 dark:text-gray-300 mt-4">
            letsboulder&apos;s route database is community-created. Route information, grades, locations, photos, and access details are submitted by users. We do not guarantee the accuracy, completeness, or safety of any user-submitted content.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">4. Accounts</h2>
          <p className="text-gray-700 dark:text-gray-300">You are responsible for:</p>
          <ul className="list-disc space-y-1 pl-5 text-gray-700 dark:text-gray-300">
            <li>keeping your login details secure;</li>
            <li>ensuring your account information is accurate;</li>
            <li>activity that occurs under your account; and</li>
            <li>promptly telling us about suspected unauthorized access.</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">5. Community Rules</h2>
          <p className="text-gray-700 dark:text-gray-300">You must not:</p>
          <ul className="list-disc space-y-1 pl-5 text-gray-700 dark:text-gray-300">
            <li>upload false, dangerous, misleading, or intentionally unsafe climbing information;</li>
            <li>impersonate another person or entity;</li>
            <li>harass, abuse, threaten, stalk, or discriminate against others;</li>
            <li>upload content you do not own or have permission to share;</li>
            <li>upload malicious code or attempt unauthorized access;</li>
            <li>post illegal, hateful, sexually explicit, or violent content; or</li>
            <li>interfere with the normal operation of the service.</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">6. User Content</h2>
          <p className="text-gray-700 dark:text-gray-300">
            You keep ownership of the content you upload. By uploading content, you grant letsboulder a non-exclusive, worldwide, royalty-free license to host, store, reproduce, adapt for technical delivery, display, and distribute that content as needed to operate and improve the service.
          </p>
          <p className="text-gray-700 dark:text-gray-300">
            You represent that you have the rights and permissions needed to upload the content and that sharing it does not violate the rights of others.
          </p>
          <p className="text-gray-700 dark:text-gray-300">
            When you make a public contribution after accepting the <Link href="/open-data-terms" className="underline">Open Data Contributor Terms</Link>, photos and expressive text are made available under CC BY-SA 4.0, while structured climbing data and route geometry are made available under ODbL 1.0.
          </p>
          <p className="text-gray-700 dark:text-gray-300">
            If you delete your account, some uploaded route content may be deleted or may remain on letsboulder without personal attribution depending on the deletion option available at the time.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">7. Moderation and Removal</h2>
          <p className="text-gray-700 dark:text-gray-300">
            We may review, moderate, reject, remove, anonymize, preserve, or restrict content or accounts where reasonably necessary to enforce these Terms, respond to complaints, address safety concerns, protect landowners or access arrangements, or protect the service and its users.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">8. Climbing Safety and Assumption of Risk</h2>
          <p className="text-gray-700 dark:text-gray-300">
            Climbing, bouldering, spotting, route development, and visiting outdoor climbing areas are inherently dangerous activities that can cause serious injury, permanent disability, or death.
          </p>
          <p className="text-gray-700 dark:text-gray-300">
            By using letsboulder, you acknowledge and agree that route descriptions, grades, names, access details, approach information, photo topos, and conditions may be incomplete, inaccurate, outdated, or wrong. Natural rock, anchors, pads, landings, weather, tides, vegetation, erosion, and human changes can change without notice.
          </p>
          <p className="text-gray-700 dark:text-gray-300">
            You are solely responsible for assessing risks, checking land access permissions, evaluating conditions, choosing partners, selecting and inspecting equipment, obtaining instruction where needed, and deciding whether to climb or travel.
          </p>
          <p className="text-gray-700 dark:text-gray-300">
            letsboulder does not provide professional guiding, rescue, engineering, land-access, or safety advice. You assume all risks arising from your use of the service and from any decisions you make in reliance on user-submitted information.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">9. No Warranty</h2>
          <p className="text-gray-700 dark:text-gray-300">
            letsboulder is provided &quot;as is&quot; and &quot;as available&quot; without warranties of any kind, to the fullest extent permitted by law. We do not guarantee that the service will always be available, secure, accurate, or error-free.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">10. Limitation of Liability</h2>
          <p className="text-gray-700 dark:text-gray-300">
            To the fullest extent permitted by law, letsboulder and its operator will not be liable for any indirect, incidental, special, consequential, exemplary, or punitive damages, or for property damage, lost profits, lost data, business interruption, or similar losses arising out of or related to your use of the service, your climbing or travel activities, your reliance on route or map information, user content, or third-party conduct.
          </p>
          <p className="text-gray-700 dark:text-gray-300">
            Nothing in these Terms excludes or limits liability that cannot lawfully be excluded or limited, including liability for death or personal injury caused by negligence, fraud, or fraudulent misrepresentation.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">11. Indemnity</h2>
          <p className="text-gray-700 dark:text-gray-300">
            You agree to indemnify and hold harmless letsboulder and its operator from claims, losses, liabilities, damages, and expenses, including reasonable legal fees, arising from your use of the service, your content, your climbing or access-related conduct, or your violation of these Terms or third-party rights.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">12. Third-Party Services</h2>
          <p className="text-gray-700 dark:text-gray-300">
            letsboulder relies on third-party services including Supabase, Vercel, Resend, Cloudflare (R2 storage, Workers, CDN), and Sentry. Their services are subject to their own terms and privacy practices.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">13. Suspension and Termination</h2>
          <p className="text-gray-700 dark:text-gray-300">
            We may suspend, restrict, or terminate your account or access to content if we reasonably believe you violated these Terms, created safety risk, exposed us to legal risk, or harmed the community or the service.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">14. Changes to the Service and Terms</h2>
          <p className="text-gray-700 dark:text-gray-300">
            We may change or discontinue features at any time. We may also update these Terms from time to time. If changes are material, we may provide notice in the app or request renewed acceptance before continued use of certain features.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">15. Governing Law and Disputes</h2>
          <p className="text-gray-700 dark:text-gray-300">
            These Terms are governed by the laws of England and Wales, unless mandatory consumer protection law requires otherwise. Courts of England and Wales will have jurisdiction, except where mandatory law gives you the right to bring claims elsewhere.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">16. Contact</h2>
          <p className="text-gray-700 dark:text-gray-300">
            If you have questions about these Terms, contact <a href="mailto:hello@letsboulder.com" className="underline">hello@letsboulder.com</a>.
          </p>
          <p className="text-gray-700 dark:text-gray-300">
            letsboulder is operated by Patrick William Hadow trading as letsboulder, an individual / sole trader based in the United Kingdom.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">17. Open Source</h2>
          <p className="text-gray-700 dark:text-gray-300">
            The letsboulder software is open source under the Apache License 2.0. The{' '}
            <a
              className="underline"
              href={SOURCE_REPOSITORY_URL}
              rel="noopener noreferrer"
              target="_blank"
            >
              source code is available on GitHub (opens in a new tab)
            </a>. Users retain ownership of their uploaded content, which is governed by Section 6 (User Content).
          </p>
        </section>
      </div>
    </div>
  )
}
