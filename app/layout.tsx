import type { Metadata, Viewport } from 'next'
import Script from 'next/script'
import { Geist, Geist_Mono } from 'next/font/google'

import './globals.css'
import JsonLd from '@/components/JsonLd'
import RootClientUtilities from '@/components/RootClientUtilities'
import QueryProviders from '@/components/QueryProviders'
import SkipLink from '@/components/SkipLink'
import { OpenDataConsentProvider } from '@/features/legal/components/OpenDataConsentProvider'

import '@/lib/env-startup'
import {
  BRAND_NAME,
  INSTAGRAM_URL,
  SITE_URL,
  SUPPORT_EMAIL,
  SOURCE_REPOSITORY_URL,
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
        <JsonLd
          data={[
            {
              '@context': 'https://schema.org',
              '@type': 'WebSite',
              name: BRAND_NAME,
              url: SITE_URL,
              description: 'Climbing map with photo topos and route beta from Guernsey to Skye',
              potentialAction: {
                '@type': 'SearchAction',
                target: {
                  '@type': 'EntryPoint',
                  urlTemplate: `${SITE_URL}/?q={search_term_string}`,
                },
                'query-input': 'required name=search_term_string',
              },
            },
            {
              '@context': 'https://schema.org',
              '@type': 'Organization',
              name: BRAND_NAME,
              url: SITE_URL,
              logo: `${SITE_URL}/icon-512.png`,
              description: 'Community-driven climbing platform with an interactive map, photo topos, and a personal logbook.',
              sameAs: [X_URL, INSTAGRAM_URL, SOURCE_REPOSITORY_URL],
              contactPoint: {
                '@type': 'ContactPoint',
                email: SUPPORT_EMAIL,
                contactType: 'customer service',
              },
            },
          ]}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} bg-white text-gray-900 antialiased dark:bg-gray-950 dark:text-gray-300`}
      >
        <SkipLink />
        <QueryProviders>
          <OpenDataConsentProvider>
            {children}
            <RootClientUtilities />
          </OpenDataConsentProvider>
        </QueryProviders>
      </body>
    </html>
  )
}
