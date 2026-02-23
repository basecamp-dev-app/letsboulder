import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createErrorResponse } from '@/lib/errors'
import { withCsrfProtection } from '@/lib/csrf-server'
import { notifyGymOwnerApplication } from '@/lib/discord'

type ApplicationRole = 'owner' | 'manager' | 'head_setter'
type ApplicationFacility = 'sport' | 'boulder'

interface GymOwnerApplicationBody {
  gym_name?: string
  address?: string
  facilities?: string[]
  contact_phone?: string
  contact_email?: string
  role?: string
  additional_comments?: string | null
}

const ALLOWED_ROLES = new Set<ApplicationRole>(['owner', 'manager', 'head_setter'])
const ALLOWED_FACILITIES = new Set<ApplicationFacility>(['sport', 'boulder'])

function isValidEmail(value: string): boolean {
  return /^\S+@\S+\.\S+$/.test(value)
}

export async function POST(request: NextRequest) {
  const csrfResult = await withCsrfProtection(request)
  if (!csrfResult.valid) return csrfResult.response!

  const cookies = request.cookies
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookies.getAll() },
        setAll() {},
      },
    }
  )

  try {
    const payload = await request.json() as GymOwnerApplicationBody

    const gymName = payload.gym_name?.trim() || ''
    const address = payload.address?.trim() || ''
    const contactPhone = payload.contact_phone?.trim() || ''
    const contactEmail = payload.contact_email?.trim().toLowerCase() || ''
    const role = payload.role?.trim() || ''
    const additionalComments = payload.additional_comments?.trim() || null
    const facilities = Array.from(new Set((payload.facilities || []).map(value => value.trim().toLowerCase()).filter(Boolean)))

    if (!gymName) {
      return NextResponse.json({ error: 'gym_name is required' }, { status: 400 })
    }

    if (!address) {
      return NextResponse.json({ error: 'address is required' }, { status: 400 })
    }

    if (!contactPhone) {
      return NextResponse.json({ error: 'contact_phone is required' }, { status: 400 })
    }

    if (!contactEmail || !isValidEmail(contactEmail)) {
      return NextResponse.json({ error: 'A valid contact_email is required' }, { status: 400 })
    }

    if (!ALLOWED_ROLES.has(role as ApplicationRole)) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
    }

    if (facilities.length === 0) {
      return NextResponse.json({ error: 'At least one facility is required' }, { status: 400 })
    }

    for (const facility of facilities) {
      if (!ALLOWED_FACILITIES.has(facility as ApplicationFacility)) {
        return NextResponse.json({ error: `Invalid facility: ${facility}` }, { status: 400 })
      }
    }

    if (additionalComments && additionalComments.length > 2000) {
      return NextResponse.json({ error: 'additional_comments must be 2000 characters or less' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('gym_owner_applications')
      .insert({
        gym_name: gymName,
        address,
        facilities,
        contact_phone: contactPhone,
        contact_email: contactEmail,
        role,
        additional_comments: additionalComments,
      })
      .select('id, created_at, status')
      .single()

    if (error) {
      return createErrorResponse(error, 'Failed to submit application')
    }

    notifyGymOwnerApplication({
      id: data.id,
      gymName,
      address,
      facilities,
      contactPhone,
      contactEmail,
      role,
      additionalComments,
      createdAt: data.created_at,
    }).catch(err => {
      console.error('Discord gym owner application notification error:', err)
    })

    return NextResponse.json(data, { status: 201 })
  } catch (error) {
    return createErrorResponse(error, 'Failed to submit application')
  }
}
