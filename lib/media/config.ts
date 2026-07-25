import { serverEnv } from '@/lib/env.server'

interface MediaStorageConfig {
  provider: 'r2'
  s3Endpoint: string
  privateBucket: string
  publicBucket: string
  cdnBaseUrl: string
}

export function getMediaStorageConfig(): MediaStorageConfig {
  return {
    provider: 'r2',
    s3Endpoint: serverEnv.R2_S3_ENDPOINT ?? '',
    privateBucket: serverEnv.R2_PRIVATE_BUCKET ?? '',
    publicBucket: serverEnv.R2_PUBLIC_BUCKET ?? '',
    cdnBaseUrl: serverEnv.NEXT_PUBLIC_MEDIA_CDN_URL?.replace(/\/$/, '') ?? '',
  }
}
