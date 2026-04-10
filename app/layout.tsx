import type { Metadata, Viewport } from 'next'
import Script from 'next/script'
import { Geist, Geist_Mono } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { SpeedInsights } from '@vercel/speed-insights/next'
import './globals.css'
import RootClientUtilities from '@/components/RootClientUtilities'
import QueryProviders from '@/components/QueryProviders'
import WebVitalsReporter from '@/components/WebVitalsReporter'
import '@/lib/env-startup'
import {
  BRAND_NAME,
  INSTAGRAM_URL,
  SITE_URL,
  SUPPORT_EMAIL,
  X_HANDLE,
  X_URL,
} from '@/lib/site'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'letsboulder - Climbing Maps, Topos & Logbook',
    template: '%s | letsboulder',
  },
  description: 'Explore climbing on an interactive map with photo topos, route beta, and a community logbook, from Guernsey to Skye and beyond.',
  keywords: [
    'letsboulder',
    'bouldering',
    'climbing',
    'guernsey bouldering',
    'guernsey climbing',
    'guernsey bouldering map',
    'guernsey climbing map',
    'guernsey bouldering topos',
    'skye bouldering',
    'isle of skye climbing',
    'scotland climbing map',
    'uk climbing map',
    'bouldering topo',
    'climbing topo',
    'route finder',
    'boulder map',
    'crag guide',
    'climbing logbook',
    'send tracker',
    'bouldering beta',
    'grade consensus',
    'V-scale',
    'Font scale',
    'community-driven',
    'crowdsourced climbing',
    'verified routes',
  ],
  authors: [{ name: BRAND_NAME }],
  creator: BRAND_NAME,
  publisher: BRAND_NAME,
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: SITE_URL,
    siteName: BRAND_NAME,
    title: 'letsboulder - Climbing Maps, Topos & Logbook',
    description: 'Explore climbing maps and photo topos from Guernsey to Skye, with route beta and a community logbook.',
    images: [
      {
        url: '/og.png',
        width: 1200,
        height: 630,
        alt: 'letsboulder - Bouldering Topos & Climbing Logbook',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'letsboulder - Climbing Maps, Topos & Logbook',
    description: 'Explore climbing maps and photo topos from Guernsey to Skye, with route beta and a community logbook.',
    images: ['/og.png'],
    creator: X_HANDLE,
  },
  other: {
    'apple-mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-status-bar-style': 'default',
    'apple-mobile-web-app-title': BRAND_NAME,
    'mobile-web-app-capable': 'yes',
  },
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#000000' },
    { media: '(prefers-color-scheme: light)', color: '#000000' },
  ],
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="icon" href="/favicon.png" sizes="32x32" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" sizes="180x180" />
        <link rel="manifest" href="/manifest.json" />
        <Script src="/theme-init.js" strategy="beforeInteractive" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify([
              {
                "@context": "https://schema.org",
                "@type": "WebSite",
                name: BRAND_NAME,
                url: SITE_URL,
                description: 'Climbing map with photo topos and route beta from Guernsey to Skye',
                potentialAction: {
                  "@type": "SearchAction",
                  target: {
                    "@type": "EntryPoint",
                    urlTemplate: `${SITE_URL}/?q={search_term_string}`,
                  },
                  "query-input": "required name=search_term_string",
                },
              },
              {
                "@context": "https://schema.org",
                "@type": "Organization",
                name: BRAND_NAME,
                url: SITE_URL,
                logo: `${SITE_URL}/icon-512.png`,
                description: 'Community-driven climbing platform with an interactive map, photo topos, and a personal logbook.',
                sameAs: [
                  X_URL,
                  INSTAGRAM_URL
                ],
                contactPoint: {
                  "@type": "ContactPoint",
                  email: SUPPORT_EMAIL,
                  contactType: "customer service"
                }
              }
            ]),
          }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased md:pb-16 pb-[calc(var(--app-mobile-footer-offset,4rem)+env(safe-area-inset-bottom,0px))] bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-300`}
      >
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[9999] focus:px-4 focus:py-2 focus:bg-gray-900 focus:text-white focus:rounded-md focus:outline-none"
        >
          Skip to main content
        </a>
        <QueryProviders>
          {children}
          <WebVitalsReporter />
          <RootClientUtilities />
          <Analytics />
          <SpeedInsights />
        </QueryProviders>
      </body>
    </html>
  )
}
