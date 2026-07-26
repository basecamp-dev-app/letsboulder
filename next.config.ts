import { withSentryConfig } from '@sentry/nextjs'
import type { NextConfig } from 'next'

function getMediaCdnRemotePattern(): URL | null {
  const raw = process.env.NEXT_PUBLIC_MEDIA_CDN_URL?.trim()
  if (!raw) return null

  try {
    return new URL(raw)
  } catch {
    return null
  }
}

function getSupabaseStorageRemotePattern(): URL | null {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  if (!raw) return null

  try {
    return new URL(`/storage/v1/object/public/**`, raw)
  } catch {
    return null
  }
}

const mediaCdnRemotePattern = getMediaCdnRemotePattern()
const supabaseStorageRemotePattern = getSupabaseStorageRemotePattern()

const nextConfig: NextConfig = {
  poweredByHeader: false,
  allowedDevOrigins: [
    'http://127.0.0.1:3000',
    'http://localhost:3000',
    'http://127.0.0.1:3001',
    'http://localhost:3001',
    'http://192.168.68.65:3000',
    'http://10.97.156.72:3000',
  ],
  async redirects() {
    return [
      {
        source: '/map',
        destination: '/',
        permanent: true,
      },
      {
        source: '/bouldering-map',
        destination: '/',
        permanent: true,
      },
      {
        source: '/climbing-map',
        destination: '/',
        permanent: true,
      },
      {
        source: '/rock-climbing-map',
        destination: '/',
        permanent: true,
      },
    ]
  },
  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-cache, no-store, must-revalidate',
          },
        ],
      },
      {
        source: '/manifest.json',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-cache, must-revalidate',
          },
        ],
      },
      {
        source: '/sw-build-assets.json',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-cache, no-store, must-revalidate',
          },
        ],
      },
      {
        source: '/(.*)',
        headers: [
          { key: 'Referrer-Policy', value: 'no-referrer' },
          {
            key: 'Content-Security-Policy',
            value:
              "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline' https://sentry.io; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://*.supabase.co https://*.cloudflarestorage.com https://media-letsboulder.pages.dev https://server.arcgisonline.com https://static.letsboulder.com https://static.dev.letsboulder.com https://tiles.openfreemap.org https://lh3.googleusercontent.com; connect-src 'self' http://127.0.0.1:54321 http://localhost:54321 https://*.supabase.co https://*.cloudflarestorage.com https://static.letsboulder.com https://static.dev.letsboulder.com https://tiles.openfreemap.org wss://*.supabase.co; font-src 'self' https://tiles.openfreemap.org; worker-src 'self' blob:; frame-ancestors 'none';",
          },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
        ],
      },
    ]
  },
  images: {
    loader: 'custom',
    loaderFile: './lib/media/cloudflare-loader.ts',
    minimumCacheTTL: 60 * 60 * 24 * 30,
    localPatterns: [
      {
        pathname: '/logo-light.png',
      },
      {
        pathname: '/logo-dark.png',
      },
      {
        pathname: '/api/media/**',
      },
    ],
    remotePatterns: [
      ...(supabaseStorageRemotePattern ? [supabaseStorageRemotePattern] : []),
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
        pathname: '/**',
      },
      {
        protocol: 'http',
        hostname: 'localhost',
        pathname: '/storage/v1/object/public/**',
      },
      {
        protocol: 'http',
        hostname: '127.0.0.1',
        port: '54321',
        pathname: '/storage/v1/object/public/**',
      },
      ...(mediaCdnRemotePattern ? [mediaCdnRemotePattern] : []),
    ],
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],
  },
  experimental: {
    optimizePackageImports: ['lucide-react', 'recharts', 'date-fns', '@dnd-kit/core', '@dnd-kit/sortable', '@dnd-kit/utilities'],
  },
  turbopack: {
    resolveAlias: process.env.ENABLE_TEST_AUTH_ENDPOINT === 'true'
      ? {}
      : {
          '@/lib/test-auth-handler': '@/app/api/test/[segment]/auth/stub',
        },
  },
}

export default withSentryConfig(nextConfig, {
  org: 'letsboulder',
  project: 'letsboulder-app',
  silent: !process.env.CI,
  widenClientFileUpload: true,
  disableLogger: true,
  tunnelRoute: '/monitoring',
})
