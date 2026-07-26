'use server'

import { headers } from 'next/headers'
import { type ActionResult } from '@/lib/actions/action-result'
import { validateActionInput } from '@/lib/actions/validate-action-input'
import { notifyGymOwnerApplication } from '@/lib/discord'
import { getServerClient } from '@/lib/supabase-server'
import { reportError } from '@/lib/errors'
import { rateLimit } from '@/lib/rate-limit'
import { verifyTurnstile } from '@/lib/turnstile'
import { z } from 'zod'

type ApplicationRole = 'owner' | 'manager' | 'head_setter'
type ApplicationFacility = 'sport' | 'boulder'

interface GymOwnerApplicationInput {
  gym_name?: string
  address?: string
  city?: string
  country?: string
  postcode_or_zip?: string
  facilities?: string[]
  contact_phone?: string
  contact_email?: string
  role?: string
  additional_comments?: string | null
  website_url?: string
  turnstileToken?: string
}

const APPLICATION_ROLES = ['owner', 'manager', 'head_setter'] as const
const APPLICATION_FACILITIES = ['sport', 'boulder'] as const

function isValidEmail(value: string): boolean {
  return /^\S+@\S+\.\S+$/.test(value)
}

const gymOwnerApplicationSchema = z.object({
  gym_name: z.string().trim().min(1, 'gym_name is required'),
  address: z.string().trim().min(1, 'address is required'),
  city: z.string().trim().min(1, 'city is required'),
  country: z.string().trim().min(1, 'country is required'),
  postcode_or_zip: z.string().trim().min(1, 'postcode_or_zip is required'),
  facilities: z.array(z.string().trim().toLowerCase()).transform((values) => Array.from(new Set(values.filter(Boolean)))).refine((values) => values.length > 0, 'At least one facility is required').refine((values) => values.every((value) => APPLICATION_FACILITIES.includes(value as ApplicationFacility)), {
    message: 'Invalid facility',
  }),
  contact_phone: z.string().trim().min(1, 'contact_phone is required'),
  contact_email: z.string().trim().toLowerCase().min(1, 'A valid contact_email is required').refine(isValidEmail, 'A valid contact_email is required'),
  role: z.string().trim().refine((value) => APPLICATION_ROLES.includes(value as ApplicationRole), 'Invalid role'),
  additional_comments: z.string().trim().max(2000, 'additional_comments must be 2000 characters or less').nullable().optional(),
  website_url: z.string().trim().optional().default(''),
  turnstileToken: z.string().min(1, 'Turnstile verification required'),
})

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
