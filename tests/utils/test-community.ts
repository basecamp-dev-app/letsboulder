import { supabaseAdmin } from './supabase-admin'

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

  return data
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

  return data
}
