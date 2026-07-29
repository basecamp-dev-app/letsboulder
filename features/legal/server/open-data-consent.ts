import type { SupabaseClient } from '@supabase/supabase-js'

import type { Database } from '@/types/database'

export const OPEN_DATA_CONSENT_REQUIRED = 'OPEN_DATA_CONSENT_REQUIRED'

export async function hasOpenDataConsent(supabase: SupabaseClient<Database>): Promise<boolean> {
  const { data, error } = await supabase.rpc('has_valid_open_data_consent')
  return !error && data === true
}

export function isOpenDataConsentError(error: { details?: string | null }): boolean {
  return error.details === 'open_data_consent_required'
}