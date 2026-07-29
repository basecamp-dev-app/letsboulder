import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Open Data Contributor Terms',
  description: 'Licensing terms for contributions to the LetsBoulder open climbing wiki.',
}

export default function OpenDataTermsPage() {
  return (
    <main className="container mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Open Data Contributor Terms</h1>
      <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Version 2026-07-29-v1, effective 29 July 2026</p>
      <div className="mt-8 space-y-8 text-gray-700 dark:text-gray-300">
        <section><h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Your contributions</h2><p className="mt-2">You keep any rights you hold. By agreeing and contributing, you grant the public permission to reuse your contributions under the licenses below, and you confirm you have the rights needed to do so.</p></section>
        <section id="media"><h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Photos and text</h2><p className="mt-2">Photos, descriptions, comments, and other expressive text are made available under the <a href="https://creativecommons.org/licenses/by-sa/4.0/" className="underline" rel="license">Creative Commons Attribution-ShareAlike 4.0 International license</a>.</p></section>
        <section><h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Structured data and geometry</h2><p className="mt-2">Structured climbing facts, coordinates, grades, votes, and route geometry are made available under the <a href="https://opendatacommons.org/licenses/odbl/1-0/" className="underline" rel="license">Open Data Commons Open Database License 1.0</a>.</p></section>
        <section><h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Account-level agreement</h2><p className="mt-2">This agreement applies prospectively to contributions made from your account while this version is active. If these terms materially change, LetsBoulder will ask you to agree to the new version before another contribution.</p></section>
      </div>
    </main>
  )
}
