'use server'

import { type ActionResult } from '@/lib/actions/action-result'
import { notifyGymOwnerApplication } from '@/lib/discord'
import { getServerClient } from '@/lib/supabase-server'

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
}

const ALLOWED_ROLES = new Set<ApplicationRole>(['owner', 'manager', 'head_setter'])
const ALLOWED_FACILITIES = new Set<ApplicationFacility>(['sport', 'boulder'])

function isValidEmail(value: string): boolean {
  return /^\S+@\S+\.\S+$/.test(value)
}

export async function submitGymOwnerApplicationAction(input: GymOwnerApplicationInput): Promise<ActionResult> {
  const honeypot = (input.website_url as string)?.trim() || ''
  if (honeypot) {
    return { success: false, error: 'Invalid submission', status: 400 }
  }

  const gymName = input.gym_name?.trim() || ''
  const address = input.address?.trim() || ''
  const city = input.city?.trim() || ''
  const country = input.country?.trim() || ''
  const postcodeOrZip = input.postcode_or_zip?.trim() || ''
  const contactPhone = input.contact_phone?.trim() || ''
  const contactEmail = input.contact_email?.trim().toLowerCase() || ''
  const role = input.role?.trim() || ''
  const additionalComments = input.additional_comments?.trim() || null
  const facilities = Array.from(new Set((input.facilities || []).map(value => value.trim().toLowerCase()).filter(Boolean)))

  if (!gymName) return { success: false, error: 'gym_name is required', status: 400 }
  if (!address) return { success: false, error: 'address is required', status: 400 }
  if (!city) return { success: false, error: 'city is required', status: 400 }
  if (!country) return { success: false, error: 'country is required', status: 400 }
  if (!postcodeOrZip) return { success: false, error: 'postcode_or_zip is required', status: 400 }
  if (!contactPhone) return { success: false, error: 'contact_phone is required', status: 400 }
  if (!contactEmail || !isValidEmail(contactEmail)) return { success: false, error: 'A valid contact_email is required', status: 400 }
  if (!ALLOWED_ROLES.has(role as ApplicationRole)) return { success: false, error: 'Invalid role', status: 400 }
  if (facilities.length === 0) return { success: false, error: 'At least one facility is required', status: 400 }

  for (const facility of facilities) {
    if (!ALLOWED_FACILITIES.has(facility as ApplicationFacility)) {
      return { success: false, error: `Invalid facility: ${facility}`, status: 400 }
    }
  }

  if (additionalComments && additionalComments.length > 2000) {
    return { success: false, error: 'additional_comments must be 2000 characters or less', status: 400 }
  }

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
    console.error('Failed to submit application:', error)
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
    console.error('Discord gym owner application notification error:', err)
  })

  return { success: true }
}
