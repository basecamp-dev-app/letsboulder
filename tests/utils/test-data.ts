import { supabaseAdmin } from './supabase-admin'

export async function createTestCrag(): Promise<string> {
  const timestamp = Date.now()
  
  const { data, error } = await supabaseAdmin
    .from('crags')
    .insert({
      name: `Test Crag ${timestamp}`,
      latitude: 49.0 + Math.random() * 0.1,
      longitude: -2.0 + Math.random() * 0.1,
      type: 'boulder',
    })
    .select('id')
    .single()

  if (error) {
    throw new Error(`Failed to create test crag: ${error.message}`)
  }

  return data.id
}

export async function cleanupTestCrag(cragId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('crags')
    .delete()
    .eq('id', cragId)

  if (error) {
    console.error(`Failed to delete test crag ${cragId}:`, error.message)
  }
}
