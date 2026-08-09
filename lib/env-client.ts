type ClientEnv = {
  NEXT_PUBLIC_SUPABASE_URL?: string
  NEXT_PUBLIC_SUPABASE_ANON_KEY?: string
  NEXT_PUBLIC_MEDIA_CDN_URL?: string
  NEXT_PUBLIC_APP_URL: string
  NEXT_PUBLIC_SITE_URL?: string
  NEXT_PUBLIC_ALLOW_PENDING_IMAGES: boolean
  NEXT_PUBLIC_DEBUG_IMAGE_UPLOADS: boolean
  NEXT_PUBLIC_DEBUG_IMAGE_GPS: boolean
}

function readBooleanFlag(value: string | undefined, truthyValues: string[]): boolean {
  return value != null && truthyValues.includes(value)
}

export const clientEnv: ClientEnv = {
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_MEDIA_CDN_URL: process.env.NEXT_PUBLIC_MEDIA_CDN_URL,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  NEXT_PUBLIC_ALLOW_PENDING_IMAGES: readBooleanFlag(process.env.NEXT_PUBLIC_ALLOW_PENDING_IMAGES, ['true']),
  NEXT_PUBLIC_DEBUG_IMAGE_UPLOADS: readBooleanFlag(process.env.NEXT_PUBLIC_DEBUG_IMAGE_UPLOADS, ['1']),
  NEXT_PUBLIC_DEBUG_IMAGE_GPS: readBooleanFlag(process.env.NEXT_PUBLIC_DEBUG_IMAGE_GPS, ['true']),
}
