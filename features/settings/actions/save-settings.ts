'use server'

import { getActionAuth } from '@/lib/actions/action-auth'
import { fail, type ActionResult } from '@/lib/actions/action-result'
import { validateActionInput } from '@/lib/actions/validate-action-input'
import { normalizeSubmissionCreditHandle, normalizeSubmissionCreditPlatform } from '@/lib/submission-credit'
import { getServerClient } from '@/lib/supabase-server'
import { reportError } from '@/lib/errors'
import { z } from 'zod'

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

const saveSettingsSchema = z.object({
  bio: z.string().optional(),
  boulderSystem: z.enum(VALID_GRADE_SYSTEMS).optional(),
  routeSystem: z.enum(VALID_GRADE_SYSTEMS).optional(),
  tradSystem: z.enum(VALID_GRADE_SYSTEMS).optional(),
  units: z.string().optional(),
  isPublic: z.boolean().optional(),
  defaultLocation: z.string().optional(),
  defaultLocationName: z.string().optional(),
  defaultLocationLat: z.number().nullable().optional(),
  defaultLocationLng: z.number().nullable().optional(),
  defaultLocationZoom: z.number().nullable().optional(),
  themePreference: z.string().optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  gender: z.enum(VALID_GENDERS).nullable().or(z.literal('')).optional(),
  heightCm: z.union([z.number(), z.null(), z.literal('')]).optional(),
  reachCm: z.union([z.number(), z.null(), z.literal('')]).optional(),
  contributionCreditPlatform: z.string().nullable().optional(),
  contributionCreditHandle: z.string().nullable().optional(),
})

export async function saveSettingsAction(input: SaveSettingsInput): Promise<ActionResult<{ warning?: string }>> {
  const validation = validateActionInput(saveSettingsSchema, input)
  if (!validation.success) {
    return fail<{ warning?: string }>(
      validation.result.error || 'Invalid request data',
      validation.result.status || 400,
      validation.result.fieldErrors
    )
  }

  const auth = await getActionAuth()
  if (!auth.success) {
    return { success: false, error: auth.error, status: auth.status }
  }

  if (!auth.data?.userId) {
    return { success: false, error: 'Unauthorized', status: 401 }
  }

  const parsedInput = validation.data
  const updateData: Record<string, unknown> = {}

  if (parsedInput.bio !== undefined) updateData.bio = parsedInput.bio.slice(0, 500)
  if (parsedInput.boulderSystem !== undefined) updateData.boulder_system = parsedInput.boulderSystem
  if (parsedInput.routeSystem !== undefined) updateData.route_system = parsedInput.routeSystem
  if (parsedInput.tradSystem !== undefined) updateData.trad_system = parsedInput.tradSystem
  if (parsedInput.units !== undefined) updateData.units = parsedInput.units
  if (parsedInput.isPublic !== undefined) updateData.is_public = parsedInput.isPublic
  if (parsedInput.defaultLocation !== undefined) updateData.default_location = parsedInput.defaultLocation
  if (parsedInput.defaultLocationName !== undefined) updateData.default_location_name = parsedInput.defaultLocationName
  if (parsedInput.defaultLocationLat !== undefined) updateData.default_location_lat = parsedInput.defaultLocationLat
  if (parsedInput.defaultLocationLng !== undefined) updateData.default_location_lng = parsedInput.defaultLocationLng
  if (parsedInput.defaultLocationZoom !== undefined) updateData.default_location_zoom = parsedInput.defaultLocationZoom
  if (parsedInput.themePreference !== undefined) updateData.theme_preference = parsedInput.themePreference
  if (parsedInput.firstName !== undefined) updateData.first_name = parsedInput.firstName.trim()
  if (parsedInput.lastName !== undefined) updateData.last_name = parsedInput.lastName.trim()

  if (parsedInput.gender !== undefined) {
    if (parsedInput.gender === '' || parsedInput.gender === null) {
      updateData.gender = null
    } else {
      updateData.gender = parsedInput.gender
    }
  }

  if (parsedInput.heightCm !== undefined) {
    const parsed = parseNullableCentimeters(parsedInput.heightCm, MIN_HEIGHT_CM, MAX_HEIGHT_CM)
    if (!parsed.valid) {
      return { success: false, error: `Height must be between ${MIN_HEIGHT_CM} and ${MAX_HEIGHT_CM} cm`, status: 400 }
    }
    updateData.height_cm = parsed.parsed
  }

  if (parsedInput.reachCm !== undefined) {
    const parsed = parseNullableCentimeters(parsedInput.reachCm, MIN_REACH_CM, MAX_REACH_CM)
    if (!parsed.valid) {
      return { success: false, error: `Reach must be between ${MIN_REACH_CM} and ${MAX_REACH_CM} cm`, status: 400 }
    }
    updateData.reach_cm = parsed.parsed
  }

  if (parsedInput.contributionCreditPlatform !== undefined || parsedInput.contributionCreditHandle !== undefined) {
    const normalizedHandle = normalizeSubmissionCreditHandle(parsedInput.contributionCreditHandle)
    if (typeof parsedInput.contributionCreditHandle === 'string' && parsedInput.contributionCreditHandle.trim() && !normalizedHandle) {
      return {
        success: false,
        error: 'Handle can only include letters, numbers, periods, underscores, and hyphens (max 50)',
        status: 400,
        fieldErrors: {
          contributionCreditHandle: ['Handle can only include letters, numbers, periods, underscores, and hyphens (max 50)'],
        },
      }
    }

    if (!normalizedHandle) {
      updateData.contribution_credit_platform = null
      updateData.contribution_credit_handle = null
    } else {
      const normalizedPlatform = normalizeSubmissionCreditPlatform(parsedInput.contributionCreditPlatform)
      if (!normalizedPlatform) {
        return {
          success: false,
          error: 'Valid platform is required when a handle is provided',
          status: 400,
          fieldErrors: {
            contributionCreditPlatform: ['Valid platform is required when a handle is provided'],
          },
        }
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
