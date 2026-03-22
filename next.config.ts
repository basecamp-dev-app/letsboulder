import type { NextConfig } from 'next'

function getMediaCdnRemotePattern() {
  const raw = process.env.MEDIA_CDN_BASE_URL?.trim()
  if (!raw) return null

  try {
    const url = new URL(raw)
    return {
      protocol: url.protocol.replace(':', '') as 'http' | 'https',
      hostname: url.hostname,
      port: url.port || undefined,
      pathname: '/**',
    }
  } catch {
    return null
  }
}

const mediaCdnRemotePattern = getMediaCdnRemotePattern()

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
    ]
  },
  images: {
    loader: 'custom',
    loaderFile: './lib/media/cloudflare-loader.ts',
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
      {
        protocol: 'https',
        hostname: 'glxnbxbkedeogtcivpsx.supabase.co',
        pathname: '/storage/v1/object/public/**',
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
    optimizePackageImports: ['lucide-react', 'recharts', 'leaflet'],
  },
}

export default nextConfig
