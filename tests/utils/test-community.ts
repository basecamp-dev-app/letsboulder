import { supabaseAdmin } from './supabase-admin'

const SEEDED_PLACE_SLUG = 'e2e-seeded-place'
const SEEDED_PLACE_NAME = 'E2E Seeded Place'

export async function createTestPlace(): Promise<{ id: string; name: string; slug: string }> {
  const timestamp = Date.now()
  const name = `Test Place ${timestamp}`
  const slug = `test-place-${timestamp}`

  const { data, error } = await supabaseAdmin
    .from('places')
    .insert({
      name,
      slug,
      type: 'crag',
      country_code: 'GB',
      primary_discipline: 'boulder',
    })
    .select('id, name, slug')
    .single()

  if (error) {
    throw new Error(`Failed to create test place: ${error.message}`)
  }

  return { ...data, slug }
}

export async function createTestCommunityPost(
  placeId: string,
  userId: string,
  type: 'session' | 'update' | 'conditions' | 'question' = 'update'
): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from('community_posts')
    .insert({
      author_id: userId,
      place_id: placeId,
      type,
      body: `Test post ${Date.now()}`,
      title: type === 'session' ? 'Test Session' : null,
      discipline: 'boulder',
      start_at: type === 'session' ? new Date().toISOString() : null,
    })
    .select('id')
    .single()

  if (error) {
    throw new Error(`Failed to create test post: ${error.message}`)
  }

  return data.id
}

export async function cleanupTestPlace(placeId: string): Promise<void> {
  await supabaseAdmin.from('community_posts').delete().eq('place_id', placeId)
  await supabaseAdmin.from('places').delete().eq('id', placeId)
}

export async function ensureSeededPlace(seed?: { slug: string; name: string }): Promise<{ id: string; name: string; slug: string }> {
  const slug = seed?.slug || SEEDED_PLACE_SLUG
  const name = seed?.name || SEEDED_PLACE_NAME

  const { data: existingPlace, error: existingPlaceError } = await supabaseAdmin
    .from('places')
    .select('id, name, slug')
    .eq('country_code', 'GB')
    .eq('slug', slug)
    .maybeSingle()

  if (existingPlaceError) {
    throw new Error(`Failed to look up seeded place: ${existingPlaceError.message}`)
  }

  if (existingPlace?.id) {
    return { ...existingPlace, slug }
  }

  const { data, error } = await supabaseAdmin
    .from('crags')
    .insert({
      name,
      latitude: null,
      longitude: null,
      type: 'boulder',
      country_code: 'GB',
      slug,
    })
    .select('id, name, slug')
    .single()

  if (error || !data) {
    throw new Error(`Failed to ensure seeded place: ${error?.message || 'missing row'}`)
  }

  return { ...data, slug }
}

export async function cleanupSeededPlace(slug = SEEDED_PLACE_SLUG): Promise<void> {
  const { data } = await supabaseAdmin
    .from('places')
    .select('id')
    .eq('slug', slug)
    .maybeSingle()

  if (!data?.id) return

  await supabaseAdmin.from('community_posts').delete().eq('place_id', data.id)
  await supabaseAdmin.from('places').delete().eq('id', data.id)
}

export async function getExistingPlace(): Promise<{ id: string; name: string; slug: string } | null> {
  const { data, error } = await supabaseAdmin
    .from('places')
    .select('id, name, slug')
    .not('slug', 'is', null)
    .limit(1)
    .single()

  if (error || !data) {
    return null
  }

  if (!data.slug) return null
  return { ...data, slug: data.slug }
}
