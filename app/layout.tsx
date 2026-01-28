import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { CsrfProvider } from "@/components/csrf-provider";
import AppLayout from "@/components/AppLayout";
import { PostHogProvider } from "@/lib/posthog";
import PageViewTracker from "@/components/PageViewTracker";
import {
  BRAND_NAME,
  INSTAGRAM_URL,
  SITE_URL,
  SUPPORT_EMAIL,
  X_HANDLE,
  X_URL,
} from "@/lib/site";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "letsboulder - Guernsey Climbing Routes",
    template: "%s | letsboulder",
  },
  description: "Discover and log climbing routes in Guernsey. Interactive map, GPS-enabled uploads, and personal logbook for climbers.",
  keywords: ["letsboulder", "climbing", "Guernsey", "rock climbing", "routes", "bouldering", "outdoor climbing", "Channel Islands"],
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
    type: "website",
    locale: "en_GB",
    url: SITE_URL,
    siteName: BRAND_NAME,
    title: "letsboulder - Guernsey Climbing Routes",
    description: "Discover and log climbing routes in Guernsey. Interactive map, GPS-enabled uploads, and personal logbook for climbers.",
    images: [
      {
        url: "/logo.png",
        width: 1200,
        height: 630,
        alt: "letsboulder - Guernsey Climbing Routes",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "letsboulder - Guernsey Climbing Routes",
    description: "Discover and log climbing routes in Guernsey. Interactive map, GPS-enabled uploads, and personal logbook for climbers.",
    images: ["/logo.png"],
    creator: X_HANDLE,
  },
  other: {
    "apple-mobile-web-app-capable": "yes",
    "apple-mobile-web-app-status-bar-style": "default",
    "apple-mobile-web-app-title": BRAND_NAME,
    "mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en-GB" suppressHydrationWarning>
      <head>
        <link rel="icon" href="/favicon.png" sizes="32x32" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" sizes="180x180" />
        <link rel="icon" href="/icon-192.png" sizes="192x192" />
        <link rel="manifest" href="/manifest.json" />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                function getTheme() {
                  if (typeof localStorage !== 'undefined' && localStorage.getItem('theme')) {
                    return localStorage.getItem('theme')
                  }
                  if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
                    return 'dark'
                  }
                  return 'light'
                }
                var theme = getTheme()
                if (theme === 'dark') {
                  document.documentElement.classList.add('dark')
                } else {
                  document.documentElement.classList.remove('dark')
                }
                window.localStorage.setItem('theme', theme)
              })()
            `,
          }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify([
              {
                "@context": "https://schema.org",
                "@type": "WebSite",
                name: BRAND_NAME,
                url: SITE_URL,
                description: "Discover and log climbing routes in Guernsey",
                potentialAction: {
                  "@type": "SearchAction",
                  target: {
                    "@type": "EntryPoint",
                    urlTemplate: `${SITE_URL}/map?q={search_term_string}`,
                  },
                  "query-input": "required name=search_term_string",
                },
              },
              {
                "@context": "https://schema.org",
                "@type": "Organization",
                name: BRAND_NAME,
                url: SITE_URL,
                logo: `${SITE_URL}/logo.png`,
                description: "Community-driven bouldering platform for Guernsey, Channel Islands. Interactive map, GPS-enabled uploads, and personal logbook for climbers.",
                address: {
                  "@type": "PostalAddress",
                  addressLocality: "Guernsey",
                  addressCountry: "GB"
                },
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
          className={`${geistSans.variable} ${geistMono.variable} antialiased md:pt-20 md:pb-16 pb-[calc(4rem+env(safe-area-inset-bottom,0px))] bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-300`}
        >
        <PostHogProvider>
          <CsrfProvider />
          <PageViewTracker />
          <AppLayout>{children}</AppLayout>
        </PostHogProvider>
      </body>
    </html>
  );
}
