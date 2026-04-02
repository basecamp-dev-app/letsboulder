'use server'

import { type ActionResult } from '@/lib/actions/action-result'
import { getActionAuth } from '@/lib/actions/action-auth'
import { getServerClient } from '@/lib/supabase-server'

interface SaveProfileInput {
  username?: string
  first_name?: string
  last_name?: string
  gender?: string | null
}

export async function saveProfileAction(input: SaveProfileInput): Promise<ActionResult<{ suggestions?: string[] }>> {
  const auth = await getActionAuth()
  if (!auth.success) {
    return { success: false, error: auth.error, status: auth.status }
  }

  if (!auth.data?.userId) {
    return { success: false, error: 'Unauthorized', status: 401 }
  }

  const { username, first_name, last_name, gender } = input

  if (username !== undefined) {
    const trimmedUsername = username.trim()

    if (trimmedUsername.length === 0) {
      return { success: false, error: 'Username cannot be empty', status: 400 }
    }

    if (trimmedUsername.length < 3 || trimmedUsername.length > 30) {
      return { success: false, error: 'Username must be between 3 and 30 characters', status: 400 }
    }

    if (!/^[A-Za-z0-9._-]+$/.test(trimmedUsername)) {
      return {
        success: false,
        error: 'Username can only contain letters, numbers, underscores, periods, and hyphens',
        status: 400,
      }
    }
  }

  if (gender !== undefined && gender !== null) {
    const allowedGenders = ['male', 'female', 'other', 'prefer_not_to_say']
    if (!allowedGenders.includes(gender)) {
      return { success: false, error: 'Invalid gender value', status: 400 }
    }
  }

  const updateData: Record<string, unknown> = {}
  if (username !== undefined) updateData.username = username.trim()
  if (first_name !== undefined) updateData.first_name = first_name.trim()
  if (last_name !== undefined) updateData.last_name = last_name.trim()
  if (gender !== undefined) updateData.gender = gender

  const supabase = await getServerClient()
  const { data: existingProfile } = await supabase
    .from('profiles')
    .select('email')
    .eq('id', auth.data.userId)
    .single()

  if (!existingProfile?.email) {
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser()
    if (authUser?.email) {
      updateData.email = authUser.email
    }
  }

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

    console.error('Profile update error:', updateError)
    return { success: false, error: 'Failed to update profile', status: 500 }
  }

  return { success: true }
}
