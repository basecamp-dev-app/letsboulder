'use server'

import { getActionAuth } from '@/lib/actions/action-auth'
import { type ActionResult } from '@/lib/actions/action-result'
import { normalizeSubmissionCreditHandle, normalizeSubmissionCreditPlatform } from '@/features/submissions/lib/submission-credit'
import { getServerClient } from '@/lib/supabase-server'
import { reportError } from '@/lib/errors'

const VALID_GENDERS = ['male', 'female', 'other', 'prefer_not_to_say'] as const
const VALID_GRADE_SYSTEMS = ['font_scale', 'v_scale', 'yds_equivalent', 'french_equivalent', 'british_equivalent'] as const
const MIN_HEIGHT_CM = 100
const MAX_HEIGHT_CM = 250
const MIN_REACH_CM = 100
const MAX_REACH_CM = 260

interface SaveSettingsInput {
  bio?: string
  boulderSystem?: string
  routeSystem?: string
  tradSystem?: string
  units?: string
  isPublic?: boolean
  defaultLocation?: string
  defaultLocationName?: string
  defaultLocationLat?: number | null
  defaultLocationLng?: number | null
  defaultLocationZoom?: number | null
  themePreference?: string
  firstName?: string
  lastName?: string
  gender?: string | null
  heightCm?: number | null | ''
  reachCm?: number | null | ''
  contributionCreditPlatform?: string | null
  contributionCreditHandle?: string | null
}

function parseNullableCentimeters(value: unknown, min: number, max: number): { valid: boolean; parsed: number | null } {
  if (value === undefined) return { valid: true, parsed: null }
  if (value === null || value === '') return { valid: true, parsed: null }

  const numeric = Number(value)
  if (!Number.isFinite(numeric)) {
    return { valid: false, parsed: null }
  }

  const rounded = Math.round(numeric)
  if (rounded < min || rounded > max) {
    return { valid: false, parsed: null }
  }

  return { valid: true, parsed: rounded }
}

export async function saveSettingsAction(input: SaveSettingsInput): Promise<ActionResult<{ warning?: string }>> {
  const auth = await getActionAuth()
  if (!auth.success) {
    return { success: false, error: auth.error, status: auth.status }
  }

  if (!auth.data?.userId) {
    return { success: false, error: 'Unauthorized', status: 401 }
  }

  const updateData: Record<string, unknown> = {}

  if (input.bio !== undefined) updateData.bio = input.bio.slice(0, 500)
  if (input.boulderSystem !== undefined && VALID_GRADE_SYSTEMS.includes(input.boulderSystem as (typeof VALID_GRADE_SYSTEMS)[number])) {
    updateData.boulder_system = input.boulderSystem
  }
  if (input.routeSystem !== undefined && VALID_GRADE_SYSTEMS.includes(input.routeSystem as (typeof VALID_GRADE_SYSTEMS)[number])) {
    updateData.route_system = input.routeSystem
  }
  if (input.tradSystem !== undefined && VALID_GRADE_SYSTEMS.includes(input.tradSystem as (typeof VALID_GRADE_SYSTEMS)[number])) {
    updateData.trad_system = input.tradSystem
  }
  if (input.units !== undefined) updateData.units = input.units
  if (input.isPublic !== undefined) updateData.is_public = input.isPublic
  if (input.defaultLocation !== undefined) updateData.default_location = input.defaultLocation
  if (input.defaultLocationName !== undefined) updateData.default_location_name = input.defaultLocationName
  if (input.defaultLocationLat !== undefined) updateData.default_location_lat = input.defaultLocationLat === null ? null : Number(input.defaultLocationLat)
  if (input.defaultLocationLng !== undefined) updateData.default_location_lng = input.defaultLocationLng === null ? null : Number(input.defaultLocationLng)
  if (input.defaultLocationZoom !== undefined) updateData.default_location_zoom = input.defaultLocationZoom === null ? null : Number(input.defaultLocationZoom)
  if (input.themePreference !== undefined) updateData.theme_preference = input.themePreference
  if (input.firstName !== undefined) updateData.first_name = input.firstName.trim()
  if (input.lastName !== undefined) updateData.last_name = input.lastName.trim()

  if (input.gender !== undefined) {
    if (input.gender === '' || input.gender === null) {
      updateData.gender = null
    } else if (typeof input.gender === 'string' && VALID_GENDERS.includes(input.gender as (typeof VALID_GENDERS)[number])) {
      updateData.gender = input.gender
    }
  }

  if (input.heightCm !== undefined) {
    const parsed = parseNullableCentimeters(input.heightCm, MIN_HEIGHT_CM, MAX_HEIGHT_CM)
    if (!parsed.valid) {
      return { success: false, error: `Height must be between ${MIN_HEIGHT_CM} and ${MAX_HEIGHT_CM} cm`, status: 400 }
    }
    updateData.height_cm = parsed.parsed
  }

  if (input.reachCm !== undefined) {
    const parsed = parseNullableCentimeters(input.reachCm, MIN_REACH_CM, MAX_REACH_CM)
    if (!parsed.valid) {
      return { success: false, error: `Reach must be between ${MIN_REACH_CM} and ${MAX_REACH_CM} cm`, status: 400 }
    }
    updateData.reach_cm = parsed.parsed
  }

  if (input.contributionCreditPlatform !== undefined || input.contributionCreditHandle !== undefined) {
    const normalizedHandle = normalizeSubmissionCreditHandle(input.contributionCreditHandle)
    if (typeof input.contributionCreditHandle === 'string' && input.contributionCreditHandle.trim() && !normalizedHandle) {
      return {
        success: false,
        error: 'Handle can only include letters, numbers, periods, underscores, and hyphens (max 50)',
        status: 400,
      }
    }

    if (!normalizedHandle) {
      updateData.contribution_credit_platform = null
      updateData.contribution_credit_handle = null
    } else {
      const normalizedPlatform = normalizeSubmissionCreditPlatform(input.contributionCreditPlatform)
      if (!normalizedPlatform) {
        return { success: false, error: 'Valid platform is required when a handle is provided', status: 400 }
      }
      updateData.contribution_credit_platform = normalizedPlatform
      updateData.contribution_credit_handle = normalizedHandle
    }
  }

  updateData.updated_at = new Date().toISOString()

  const supabase = await getServerClient()
  const { error } = await supabase
    .from('profiles')
    .update(updateData)
    .eq('id', auth.data.userId)

  if (error) {
    reportError(error, { message: 'Settings save error' })
    return { success: false, error: 'Failed to save', status: 500 }
  }

  return { success: true, data: {} }
}
