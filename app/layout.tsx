import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Header from "@/components/Header";

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
  openGraph: {
    type: "website",
    locale: "en_GB",
    url: "https://gsyrocks.com",
    siteName: "gsyrocks",
    title: "gsyrocks - Guernsey Climbing Routes",
    description: "Discover and log climbing routes in Guernsey. Interactive map, GPS-enabled uploads, and personal logbook for climbers.",
    images: [
      {
        url: "/og-image.png",
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
    images: ["/og-image.png"],
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
  themeColor: "#2563eb",
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
    <html lang="en">
      <head>
        <link rel="canonical" href="https://gsyrocks.com" />
        <link rel="icon" href="/favicon.png" type="image/png" sizes="32x32" />
        <link rel="apple-touch-icon" href="/favicon.png" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
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
            }),
          }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased pt-12`}
      >
        <Header />
        {children}
      </body>
    </html>
  );
}
