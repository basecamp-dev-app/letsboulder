import { serverEnv } from '@/lib/env.server'
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

export function getMediaStorageConfig(): MediaStorageConfig {
  return {
    provider: 'r2',
    s3Endpoint: serverEnv.R2_S3_ENDPOINT,
    privateBucket: serverEnv.R2_PRIVATE_BUCKET,
    publicBucket: serverEnv.R2_PUBLIC_BUCKET,
    cdnBaseUrl: serverEnv.NEXT_PUBLIC_MEDIA_CDN_URL?.replace(/\/$/, '') ?? '',
  }
}

export function getMediaModerationConfig(): MediaModerationConfig {
  const enabled = serverEnv.MEDIA_MODERATION_ENABLED
  const providerEnv = serverEnv.MEDIA_MODERATION_PROVIDER?.toLowerCase()
  const provider: MediaModerationProvider = enabled && providerEnv !== 'disabled'
    ? 'aws_rekognition'
    : 'disabled'

  return {
    enabled,
    provider,
    failOpen: serverEnv.MEDIA_MODERATION_FAIL_OPEN,
  }
}
