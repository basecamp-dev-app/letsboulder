import { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/admin/',
        '/auth/callback',
        '/auth/callback?*',
      ],
    },
    sitemap: 'https://gsyrocks.com/sitemap.xml',
  }
}
