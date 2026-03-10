import type { MediaModerationProvider } from '@/lib/media/types'

interface MediaStorageConfig {
  provider: 'r2'
  s3Endpoint: string
  privateBucket: string
  publicBucket: string
  cdnBaseUrl: string
}

interface MediaModerationConfig {
  enabled: boolean
  provider: MediaModerationProvider
  failOpen: boolean
}

function getRequiredEnv(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }

  return value
}

function parseBooleanEnv(value: string | undefined, defaultValue: boolean): boolean {
  if (!value) return defaultValue

  const normalized = value.trim().toLowerCase()
  if (normalized === 'true') return true
  if (normalized === 'false') return false

  return defaultValue
}

export function getMediaStorageConfig(): MediaStorageConfig {
  return {
    provider: 'r2',
    s3Endpoint: getRequiredEnv('R2_S3_ENDPOINT'),
    privateBucket: getRequiredEnv('R2_PRIVATE_BUCKET'),
    publicBucket: getRequiredEnv('R2_PUBLIC_BUCKET'),
    cdnBaseUrl: getRequiredEnv('MEDIA_CDN_BASE_URL').replace(/\/$/, ''),
  }
}

export function getMediaModerationConfig(): MediaModerationConfig {
  const enabled = parseBooleanEnv(process.env.MEDIA_MODERATION_ENABLED, true)
  const providerEnv = process.env.MEDIA_MODERATION_PROVIDER?.trim().toLowerCase()
  const provider: MediaModerationProvider = enabled && providerEnv !== 'disabled'
    ? 'aws_rekognition'
    : 'disabled'

  return {
    enabled,
    provider,
    failOpen: parseBooleanEnv(process.env.MEDIA_MODERATION_FAIL_OPEN, false),
  }
}
