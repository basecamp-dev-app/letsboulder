import { getUnauthenticatedClient } from '@/lib/supabase-server'
import { getImageByDisplayId } from '@/features/image-first/server/load-image-first-page'

interface CragLocationRow {
  id: string
  name: string
  slug: string | null
  country_code: string | null
  region_name: string | null
}

export interface InstagramPostData {
  imageUrl: string
  naturalWidth: number
  naturalHeight: number
}

export async function loadInstagramPostData(args: {
  country: string
  crag: string
  imageId: string
  routeIdentifier?: string | null
}): Promise<InstagramPostData | null> {
  const image = await getImageByDisplayId(args.imageId)
  if (!image) return null

  const supabase = getUnauthenticatedClient()
  const { data: cragRow, error } = await supabase
    .from('crags')
    .select('id, name, slug, country_code, region_name')
    .eq('slug', args.crag)
    .eq('country_code', args.country.toUpperCase())
    .maybeSingle()

  if (error) throw error
  const crag = cragRow as CragLocationRow | null
  if (!crag) return null

  return {
    imageUrl: image.staticUrl,
    naturalWidth: image.width,
    naturalHeight: image.height,
  }
}
