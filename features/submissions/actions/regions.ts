'use server'

import { type ActionResult } from '@/lib/actions/action-result'
import { getActionAuth } from '@/lib/actions/action-auth'
import { getServerClient } from '@/lib/supabase-server'
import { reportError } from '@/lib/errors'

interface RegionResult {
  id: string
  name: string
  country_code: string | null
  center_lat: number | null
  center_lon: number | null
  created_at: string
}

export async function createRegionAction(name: string, countryCode?: string | null): Promise<ActionResult<RegionResult>> {
  const auth = await getActionAuth()
  if (!auth.success) return { success: false, error: auth.error, status: auth.status }
  if (!auth.data?.userId) return { success: false, error: 'Authentication required', status: 401 }

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return { success: false, error: 'Region name is required', status: 400 }
  }

  const trimmedName = name.trim()
  const supabase = await getServerClient()
  const { data: existing, error: checkError } = await supabase
    .from('climbing_areas')
    .select('id, name')
    .ilike('name', trimmedName)
    .limit(1)

  if (checkError) {
    reportError(checkError, { message: 'Error checking existing climbing area' })
    return { success: false, error: 'Error checking existing climbing area', status: 500 }
  }

  if (existing && existing.length > 0) {
    return {
      success: false,
      error: `Region "${trimmedName}" already exists`,
      status: 409,
      data: existing[0] as never,
    }
  }

  const { data: region, error: insertError } = await supabase
    .from('climbing_areas')
    .insert({
      name: trimmedName,
      country_code: countryCode?.toUpperCase().slice(0, 2) || null,
    })
    .select('id, name, country_code, center_lat, center_lon, created_at')
    .single()

  if (insertError || !region) {
    reportError(insertError, { message: 'Error creating climbing area' })
    return { success: false, error: 'Error creating climbing area', status: 500 }
  }

  return { success: true, data: region }
}
