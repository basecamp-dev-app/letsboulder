import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Cookie Policy',
  description: 'Learn how letsboulder uses cookies, local storage, and similar technologies for authentication, security, preferences, and analytics.',
  keywords: ['cookie policy', 'cookies', 'local storage', 'tracking'],
}

export default function CookiePage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="mb-6 text-3xl font-bold text-gray-900 dark:text-gray-100">
        Cookie Policy
      </h1>

      <div className="prose max-w-none dark:prose-invert">
        <p className="mb-6 text-gray-600 dark:text-gray-400">
          <strong>Last Updated:</strong> July 2026
        </p>

        <section className="mb-8 rounded-2xl border border-gray-200 bg-gray-50 p-5 dark:border-gray-800 dark:bg-gray-900/50">
          <h2 className="mt-0 text-xl font-semibold text-gray-900 dark:text-gray-100">
            Summary
          </h2>
          <ul className="mb-0 list-disc space-y-1 pl-5 text-gray-700 dark:text-gray-300">
            <li>letsboulder uses cookies and similar technologies to keep you signed in, protect the app, remember settings, and understand product performance.</li>
            <li>We also use local storage and IndexedDB for app preferences, security helpers, and selected cached app data.</li>
            <li>You can control many cookies through your browser settings.</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">1. What This Policy Covers</h2>
          <p className="text-gray-700 dark:text-gray-300">
            This Cookie Policy explains how letsboulder uses cookies, local storage, and similar client-side technologies when you visit or use the app.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">2. What We Use</h2>
          <p className="text-gray-700 dark:text-gray-300">We currently use a mix of:</p>
          <ul className="list-disc space-y-1 pl-5 text-gray-700 dark:text-gray-300">
            <li><strong>Cookies</strong> for authentication, session continuity, CSRF protection, and redirect handling.</li>
            <li><strong>Local storage</strong> for app preferences and client-side security helpers.</li>
            <li><strong>IndexedDB and browser storage</strong> for selected cached app data and app functionality.</li>
            <li><strong>Error monitoring</strong> to help us diagnose reliability and performance problems.</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">3. Categories of Technologies</h2>

          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">3.1 Strictly Necessary</h3>
          <p className="text-gray-700 dark:text-gray-300">
            These technologies are used to sign you in, keep sessions working, secure requests, and operate the app.
          </p>

          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">3.2 Preferences and Functionality</h3>
          <p className="text-gray-700 dark:text-gray-300">
            These technologies remember settings such as theme, app preferences, and other choices that improve the user experience.
          </p>

          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">3.3 Error Monitoring</h3>
          <p className="text-gray-700 dark:text-gray-300">
            We use Sentry in production to diagnose errors and performance problems. Application-level Vercel Analytics and Vercel Speed Insights are not currently initialized by letsboulder. We will update this policy and provide any legally required choices before enabling optional analytics.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">4. Examples Currently Used by letsboulder</h2>
          <ul className="list-disc space-y-2 pl-5 text-gray-700 dark:text-gray-300">
            <li><strong>Supabase auth session storage:</strong> used to persist sign-in state.</li>
            <li><strong>CSRF cookie and mirrored client token metadata:</strong> used to protect state-changing requests.</li>
            <li><strong>Redirect cookie:</strong> used briefly during some authentication flows.</li>
            <li><strong>Theme and preference storage:</strong> used to remember display and app preferences.</li>
            <li><strong>IndexedDB records:</strong> used for selected persisted app data.</li>
            <li><strong>Browser HTTP caches:</strong> managed by your browser according to our response caching headers.</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 id="privacy-choices" className="text-xl font-semibold text-gray-900 dark:text-gray-100">5. Managing Cookies, Storage, and Privacy Choices</h2>
          <p className="text-gray-700 dark:text-gray-300">
            Most browsers let you block or delete cookies and clear site storage. Blocking essential technologies may stop parts of letsboulder from working correctly, including sign-in, account settings, and other app features.
          </p>
          <p className="text-gray-700 dark:text-gray-300">
            letsboulder does not currently initialize optional application analytics, so there is no analytics preference to save. Error replay is disabled by default. If optional telemetry is introduced, its controls will remain reachable from this section and the site navigation.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">6. More Information</h2>
          <p className="text-gray-700 dark:text-gray-300">
            For questions about our use of cookies or similar technologies, contact <a href="mailto:hello@letsboulder.com" className="underline">hello@letsboulder.com</a>.
          </p>
        </section>
      </div>
    </div>
  )
}
