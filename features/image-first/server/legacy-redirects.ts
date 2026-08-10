import { buildImageFirstPath } from '@/lib/routes/image-first-path'
import { getUnauthenticatedClient } from '@/lib/supabase-server'
import type { Database } from '@/types/database'

type LegacyRouteRedirect = Database['public']['Functions']['resolve_legacy_route_redirect']['Returns'][number]
type LegacyClimbRedirect = Database['public']['Functions']['resolve_legacy_climb_redirect']['Returns'][number]
type LegacyImageRedirect = Database['public']['Functions']['resolve_legacy_image_redirect']['Returns'][number]

export async function getLegacyRouteRedirect(countryCode: string, cragSlug: string, climbSlug: string) {
  const supabase = await getUnauthenticatedClient()
  const { data, error } = await supabase
    .rpc('resolve_legacy_route_redirect', {
      p_country_code: countryCode,
      p_crag_slug: cragSlug,
      p_climb_slug: climbSlug,
    })
    .maybeSingle()

  if (error) throw error
  const redirect = data as LegacyRouteRedirect | null
  if (!redirect?.country_code || !redirect.crag_slug || !redirect.climb_slug || !redirect.effective_climb_id || !redirect.image_id) return null

  return buildImageFirstPath({
    countryCode: redirect.country_code,
    cragSlug: redirect.crag_slug,
    imageId: redirect.image_id,
    route: redirect.climb_slug,
    climbId: redirect.effective_climb_id,
  })
}

export async function getLegacyClimbRedirect(id: string) {
  const supabase = await getUnauthenticatedClient()
  const { data, error } = await supabase
    .rpc('resolve_legacy_climb_redirect', { p_climb_id: id })
    .maybeSingle()

  if (error) throw error
  const redirect = data as LegacyClimbRedirect | null
  if (!redirect?.country_code || !redirect.crag_slug || !redirect.effective_climb_id || !redirect.route_id || !redirect.image_id) return null

  return buildImageFirstPath({
    countryCode: redirect.country_code,
    cragSlug: redirect.crag_slug,
    imageId: redirect.image_id,
    route: redirect.route_id,
    climbId: redirect.effective_climb_id,
  })
}

export async function getLegacyImageRedirect(id: string) {
  const supabase = await getUnauthenticatedClient()
  const { data, error } = await supabase
    .rpc('resolve_legacy_image_redirect', { p_image_id: id })
    .maybeSingle()

  if (error) throw error
  const redirect = data as LegacyImageRedirect | null
  if (!redirect?.country_code || !redirect.crag_slug || !redirect.image_id) return null

  return {
    countryCode: redirect.country_code.toLowerCase(),
    cragSlug: redirect.crag_slug,
    imageId: redirect.image_id,
  }
}
