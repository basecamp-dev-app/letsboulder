import { getServerClientFromRequest } from '@/lib/supabase-server'

export function parsePrivateStorageUrl(url: string): { bucket: string; path: string } | null {
  if (!url.startsWith('private://')) return null
  const withoutScheme = url.slice('private://'.length)
  const slashIndex = withoutScheme.indexOf('/')
  if (slashIndex <= 0) return null

  const bucket = withoutScheme.slice(0, slashIndex)
  const path = withoutScheme.slice(slashIndex + 1)
  if (!bucket || !path) return null

  return { bucket, path }
}

export async function getRegionData(supabase: ReturnType<typeof getServerClientFromRequest>, imageId: string) {
  try {
    const { data } = await supabase
      .from('images')
      .select(`
        crags:crag_id (
          climbing_areas:region_id (
            name
          )
        )
      `)
      .eq('id', imageId)
      .single()

    if (data?.crags?.[0]?.climbing_areas?.[0]) {
      return data.crags[0].climbing_areas[0].name
    }
    return ''
  } catch {
    return ''
  }
}
