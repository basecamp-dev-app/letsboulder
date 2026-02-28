import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  allowedDevOrigins: [
    'http://127.0.0.1:3000',
    'http://localhost:3000',
    'http://127.0.0.1:3001',
    'http://localhost:3001',
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
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],
  },
  experimental: {
    optimizePackageImports: ['lucide-react', 'recharts', 'leaflet'],
  },
};

export default nextConfig;
