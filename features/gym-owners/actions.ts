'use server'

import { headers } from 'next/headers'
import { type ActionResult } from '@/lib/actions/action-result'
import { validateActionInput } from '@/lib/actions/validate-action-input'
import { notifyGymOwnerApplication } from '@/lib/discord'
import { getServerClient } from '@/lib/supabase-server'
import { reportError } from '@/lib/errors'
import { rateLimit } from '@/lib/rate-limit'
import { verifyTurnstile } from '@/lib/turnstile'
import { gymOwnerApplicationSchema, type GymOwnerApplicationInput } from '@/features/gym-owners/lib/application-schema'

export async function submitGymOwnerApplicationAction(input: GymOwnerApplicationInput): Promise<ActionResult> {
  const validation = validateActionInput(gymOwnerApplicationSchema, input)
  if (!validation.success) return validation.result

  const honeypot = validation.data.website_url
  if (honeypot) {
    return {
      success: false,
      error: 'Invalid submission',
      status: 400,
      fieldErrors: {
        website_url: ['Invalid submission'],
      },
    }
  }

  // Verify Turnstile
  const turnstileVerification = await verifyTurnstile(validation.data.turnstileToken)
  if (!turnstileVerification.success) {
    return { success: false, error: 'Verification failed', status: 403 }
  }

  // Rate limit using strict tier
  const actionHeaders = new Headers()
  const requestHeaders = await headers()
  requestHeaders.forEach((value: string, key: string) => {
    actionHeaders.set(key, value)
  })

  const actionRequest = new Request('http://localhost/server-action', {
    method: 'POST',
    headers: actionHeaders,
  })

  const rateLimitResult = await rateLimit(actionRequest, 'strict')
  if (!rateLimitResult.success) {
    return { success: false, error: 'Too many requests', status: 429 }
  }

  const {
    gym_name: gymName,
    address,
    city,
    country,
    postcode_or_zip: postcodeOrZip,
    facilities,
    contact_phone: contactPhone,
    contact_email: contactEmail,
    role,
    additional_comments: additionalCommentsRaw,
  } = validation.data
  const additionalComments = additionalCommentsRaw ?? null

  const supabase = await getServerClient()
  const { data, error } = await supabase
    .from('gym_owner_applications')
    .insert({
      gym_name: gymName,
      address,
      city,
      country,
      postcode_or_zip: postcodeOrZip,
      facilities,
      contact_phone: contactPhone,
      contact_email: contactEmail,
      role,
      additional_comments: additionalComments,
    })
    .select('id, created_at, status')
    .single()

  if (error || !data) {
    reportError(error, { message: 'Failed to submit application' })
    if (error?.code === '23505') {
      return {
        success: false,
        error: 'An application for this gym has already been received. Contact us if you need to update it.',
        status: 409,
      }
    }
    return { success: false, error: 'Failed to submit application', status: 500 }
  }

  notifyGymOwnerApplication({
    id: data.id,
    gymName,
    address,
    city,
    country,
    postcodeOrZip,
    facilities,
    contactPhone,
    contactEmail,
    role,
    additionalComments,
    createdAt: data.created_at,
  }).catch(err => {
    reportError(err, { message: 'Discord gym owner application notification error' })
  })

  return { success: true }
}
