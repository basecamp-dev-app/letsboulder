'use server'

import { fail, type ActionResult } from '@/lib/actions/action-result'
import { validateActionInput } from '@/lib/actions/validate-action-input'
import { getActionAuth } from '@/lib/actions/action-auth'
import { getServerClient } from '@/lib/supabase-server'
import { reportError } from '@/lib/errors'
import { z } from 'zod'

const allowedGenders = ['male', 'female', 'other', 'prefer_not_to_say'] as const

const saveProfileSchema = z.object({
  username: z.string().trim().min(1, 'Username cannot be empty').min(3, 'Username must be between 3 and 30 characters').max(30, 'Username must be between 3 and 30 characters').regex(/^[A-Za-z0-9._-]+$/, 'Username can only contain letters, numbers, underscores, periods, and hyphens').optional(),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  gender: z.enum(allowedGenders).nullable().optional(),
})

interface SaveProfileInput {
  username?: string
  first_name?: string
  last_name?: string
  gender?: string | null
}

export async function saveProfileAction(input: SaveProfileInput): Promise<ActionResult<{ suggestions?: string[] }>> {
  const validation = validateActionInput(saveProfileSchema, input)
  if (!validation.success) {
    return fail<{ suggestions?: string[] }>(
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

  const { username, first_name, last_name, gender } = validation.data

  const updateData: Record<string, unknown> = {}
  if (username !== undefined) updateData.username = username.trim()
  if (first_name !== undefined) updateData.first_name = first_name.trim()
  if (last_name !== undefined) updateData.last_name = last_name.trim()
  if (gender !== undefined) updateData.gender = gender

  const supabase = await getServerClient()
  const { error: updateError } = await supabase
    .from('profiles')
    .update(updateData)
    .eq('id', auth.data.userId)

  if (updateError) {
    if (updateError.code === '23505') {
      const suggestions = [
        username ? username + Math.floor(Math.random() * 1000) : null,
        first_name ? `${first_name}.${last_name || ''}`.toLowerCase().replace(/\.+$/, '') + Math.floor(Math.random() * 100) : null,
      ].filter((value): value is string => Boolean(value))

      return {
        success: false,
        error: 'Username is already taken',
        status: 409,
        data: { suggestions },
      }
    }

    reportError(updateError, { message: 'Profile update error' })
    return { success: false, error: 'Failed to update profile', status: 500 }
  }

  return { success: true }
}
