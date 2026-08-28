import { z } from 'zod'

export const APPLICATION_ROLES = ['owner', 'manager', 'head_setter'] as const
export const APPLICATION_FACILITIES = ['sport', 'boulder'] as const

export const gymOwnerApplicationSchema = z.object({
  gym_name: z.string().trim().min(1, 'Enter the gym name.').max(200, 'Gym name must be 200 characters or less.'),
  address: z.string().trim().min(1, 'Enter the street address.').max(300, 'Address must be 300 characters or less.'),
  city: z.string().trim().min(1, 'Enter the city.').max(120, 'City must be 120 characters or less.'),
  country: z.string().trim().min(1, 'Enter the country.').max(120, 'Country must be 120 characters or less.'),
  postcode_or_zip: z.string().trim().min(1, 'Enter the postcode or ZIP.').max(32, 'Postcode or ZIP must be 32 characters or less.'),
  facilities: z.array(z.string().trim().toLowerCase())
    .transform((values) => Array.from(new Set(values.filter(Boolean))))
    .refine((values) => values.length > 0, 'Select at least one gym facility.')
    .refine((values) => values.every((value) => APPLICATION_FACILITIES.includes(value as ApplicationFacility)), {
      message: 'Select a valid gym facility.',
    }),
  contact_phone: z.string().trim().min(1, 'Enter a WhatsApp phone number.').max(40, 'Phone number must be 40 characters or less.'),
  contact_email: z.string().trim().min(1, 'Enter an email address.').max(160, 'Email must be 160 characters or less.').email('Enter a valid email address.').toLowerCase(),
  role: z.string().trim().refine((value) => APPLICATION_ROLES.includes(value as ApplicationRole), 'Select a valid role.'),
  additional_comments: z.string().trim().max(2000, 'Additional comments must be 2,000 characters or less.').nullable().optional(),
  website_url: z.string().trim().optional().default(''),
  turnstileToken: z.string().min(1, 'Complete the verification.'),
})

export type ApplicationRole = typeof APPLICATION_ROLES[number]
export type ApplicationFacility = typeof APPLICATION_FACILITIES[number]
export type GymOwnerApplicationInput = Partial<z.input<typeof gymOwnerApplicationSchema>>
