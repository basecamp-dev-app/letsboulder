import { notFound, permanentRedirect } from 'next/navigation'
import { getLegacyRouteRedirect } from '@/features/image-first/server/legacy-redirects'

export const revalidate = 3600

export default async function RoutePage({
  params,
}: {
  params: Promise<{ country: string; crag: string; route: string }>
}) {
  const { country, crag, route } = await params
  if (!country || country.length !== 2) notFound()

  const redirectUrl = await getLegacyRouteRedirect(country.toUpperCase(), crag, route)
  if (!redirectUrl) notFound()

  permanentRedirect(redirectUrl)
}
