import { getStaticSitemapEntries, renderUrlSet, sitemapXmlResponse } from '@/lib/sitemap/xml'

export const revalidate = 3600

export async function GET() {
  return sitemapXmlResponse(renderUrlSet(getStaticSitemapEntries()))
}
