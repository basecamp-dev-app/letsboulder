import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { CsrfProvider } from "@/components/csrf-provider";
import AppLayout from "@/components/AppLayout";
import { PostHogProvider } from "@/lib/posthog";
import PageViewTracker from "@/components/PageViewTracker";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://gsyrocks.com"),
  title: {
    default: "gsyrocks - Guernsey Climbing Routes",
    template: "%s | gsyrocks",
  },
  description: "Discover and log climbing routes in Guernsey. Interactive map, GPS-enabled uploads, and personal logbook for climbers.",
  keywords: ["climbing", "Guernsey", "rock climbing", "routes", "bouldering", "outdoor climbing", "Channel Islands"],
  authors: [{ name: "gsyrocks" }],
  creator: "gsyrocks",
  publisher: "gsyrocks",
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
  alternates: {
    canonical: "https://gsyrocks.com",
  },
  openGraph: {
    type: "website",
    locale: "en_GB",
    url: "https://gsyrocks.com",
    siteName: "gsyrocks",
    title: "gsyrocks - Guernsey Climbing Routes",
    description: "Discover and log climbing routes in Guernsey. Interactive map, GPS-enabled uploads, and personal logbook for climbers.",
    images: [
      {
        url: "/logo.png",
        width: 1200,
        height: 630,
        alt: "gsyrocks - Guernsey Climbing Routes",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "gsyrocks - Guernsey Climbing Routes",
    description: "Discover and log climbing routes in Guernsey. Interactive map, GPS-enabled uploads, and personal logbook for climbers.",
    images: ["/logo.png"],
    creator: "@gsyrocks",
  },
  other: {
    "apple-mobile-web-app-capable": "yes",
    "apple-mobile-web-app-status-bar-style": "default",
    "apple-mobile-web-app-title": "gsyrocks",
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
                name: "gsyrocks",
                url: "https://gsyrocks.com",
                description: "Discover and log climbing routes in Guernsey",
                potentialAction: {
                  "@type": "SearchAction",
                  target: {
                    "@type": "EntryPoint",
                    urlTemplate: "https://gsyrocks.com/map?q={search_term_string}",
                  },
                  "query-input": "required name=search_term_string",
                },
              },
              {
                "@context": "https://schema.org",
                "@type": "Organization",
                name: "gsyrocks",
                url: "https://gsyrocks.com",
                logo: "https://gsyrocks.com/logo.png",
                description: "Community-driven bouldering platform for Guernsey, Channel Islands. Interactive map, GPS-enabled uploads, and personal logbook for climbers.",
                address: {
                  "@type": "PostalAddress",
                  addressLocality: "Guernsey",
                  addressCountry: "GB"
                },
                sameAs: [
                  "https://twitter.com/gsyrocks",
                  "https://www.instagram.com/gsyrocks"
                ],
                contactPoint: {
                  "@type": "ContactPoint",
                  email: "hello@gsyrocks.com",
                  contactType: "customer service"
                }
              }
            ]),
          }}
        />
      </head>
        <body
          className={`${geistSans.variable} ${geistMono.variable} antialiased pt-20 md:pb-16 pb-[calc(4rem+env(safe-area-inset-bottom,0px))] bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-300`}
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
