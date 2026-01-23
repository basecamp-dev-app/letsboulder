import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Cookie Policy | gsyrocks',
  description: 'Learn how gsyrocks uses cookies and similar technologies to improve your experience.',
  keywords: ['cookie policy', 'cookies', 'tracking', 'privacy'],
}

export default function CookiePage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-6">
        Cookie Policy
      </h1>
      
      <div className="prose dark:prose-invert max-w-none">
        <p className="text-gray-600 dark:text-gray-400 mb-6">
          This Cookie Policy explains how gsyrocks uses cookies and similar technologies to recognize you when you visit our app.
        </p>

        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mt-8 mb-4">
          What Are Cookies
        </h2>
        <p className="text-gray-600 dark:text-gray-400 mb-6">
          Cookies are small text files that are placed on your device when you visit our app. They help the app function properly and provide analytics to help us improve your experience.
        </p>

        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mt-8 mb-4">
          How We Use Cookies
        </h2>
        <p className="text-gray-600 dark:text-gray-400 mb-4">
          We use cookies for the following purposes:
        </p>
        <ul className="list-disc pl-6 mb-6 text-gray-600 dark:text-gray-400 space-y-2">
          <li><strong>Authentication:</strong> Cookies help us verify your identity when you sign in</li>
          <li><strong>Preferences:</strong> Remember your settings and preferences</li>
          <li><strong>Analytics:</strong> We use PostHog, a privacy-first analytics service, to understand how users interact with our app</li>
          <li><strong>Security:</strong> Help protect your account and detect suspicious activity</li>
        </ul>

        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mt-8 mb-4">
          Managing Cookies
        </h2>
        <p className="text-gray-600 dark:text-gray-400 mb-6">
          Most browsers allow you to control cookies through their settings. You can typically choose to block all cookies, accept all cookies, or receive a notification when a cookie is set. Please note that blocking cookies may affect your ability to use certain features of our app.
        </p>

        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mt-8 mb-4">
          Contact Us
        </h2>
        <p className="text-gray-600 dark:text-gray-400 mb-6">
          If you have questions about our use of cookies, please contact us through our support channels.
        </p>

        <p className="text-gray-600 dark:text-gray-400 text-sm mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
          Last updated: January 2025
        </p>
      </div>
    </div>
  )
}
