import { spawnSync } from 'node:child_process'
import crypto from 'node:crypto'
import type { NextConfig } from 'next'
import withSerwistInit from '@serwist/next'

const nextConfig: NextConfig = {
  allowedDevOrigins: ['http://127.0.0.1:3000', 'http://localhost:3000'],
  images: {
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
    ],
    formats: ['image/webp'],
    deviceSizes: [640, 1080, 1920],
    imageSizes: [256, 512],
    qualities: [75, 90],
    minimumCacheTTL: 2678400,
  },
  experimental: {
    optimizePackageImports: ['lucide-react', 'recharts', 'leaflet'],
  },
}

const revision =
  spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf-8' }).stdout?.trim() || crypto.randomUUID()

const withSerwist = withSerwistInit({
  swSrc: 'app/sw.ts',
  swDest: 'public/sw.js',
  register: true,
  disable: process.env.NODE_ENV === 'development',
  additionalPrecacheEntries: [{ url: '/~offline', revision }, { url: '/map', revision }],
})

export default withSerwist(nextConfig)
