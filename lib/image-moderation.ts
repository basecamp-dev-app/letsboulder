import { serverEnv } from '@/lib/env'
import { getMediaModerationConfig } from '@/lib/media/config'
import type { MediaModerationProvider, MediaModerationStatus } from '@/lib/media/types'

const MIN_MODERATION_CONFIDENCE = 60

interface ModerationLabel {
  name: string
  confidence: number
}

interface ModerationResult {
  hasHumans: boolean
  humanFaceCount: number
  moderationLabels: ModerationLabel[]
  moderationStatus: MediaModerationStatus
  moderationProvider: MediaModerationProvider
  skippedReason: string | null
}

type RekognitionClientLike = {
  send: (command: unknown) => Promise<unknown>
}

async function getRekognitionClient(): Promise<RekognitionClientLike> {
  const moderationConfig = getMediaModerationConfig()
  if (!moderationConfig.enabled || moderationConfig.provider === 'disabled') {
    throw new Error('Moderation provider is disabled')
  }

  const region = serverEnv.AWS_REGION
  const accessKeyId = serverEnv.AWS_ACCESS_KEY_ID
  const secretAccessKey = serverEnv.AWS_SECRET_ACCESS_KEY

  if (!region || !accessKeyId || !secretAccessKey) {
    throw new Error('Missing AWS Rekognition environment variables')
  }

  const awsSdk = await eval("import('@aws-sdk/client-rekognition')").catch(() => null) as unknown
  if (!awsSdk) {
    throw new Error('Missing @aws-sdk/client-rekognition dependency')
  }

  const { RekognitionClient } = awsSdk as {
    RekognitionClient: new (args: {
      region: string
      credentials: { accessKeyId: string; secretAccessKey: string }
    }) => RekognitionClientLike
  }

  return new RekognitionClient({ region, credentials: { accessKeyId, secretAccessKey } })
}

async function fetchImageBytes(imageUrl: string): Promise<Uint8Array> {
  const res = await fetch(imageUrl)
  if (!res.ok) {
    throw new Error(`Failed to fetch image bytes: ${res.status}`)
  }
  const buf = await res.arrayBuffer()
  return new Uint8Array(buf)
}

async function moderateImageBytes(bytes: Uint8Array): Promise<ModerationResult> {
  const moderationConfig = getMediaModerationConfig()
  if (!moderationConfig.enabled || moderationConfig.provider === 'disabled') {
    return {
      hasHumans: false,
      humanFaceCount: 0,
      moderationLabels: [],
      moderationStatus: 'skipped',
      moderationProvider: 'disabled',
      skippedReason: 'moderation_disabled',
    }
  }

  const awsSdk = await eval("import('@aws-sdk/client-rekognition')").catch(() => null) as unknown
  if (!awsSdk) {
    if (moderationConfig.failOpen) {
      return {
        hasHumans: false,
        humanFaceCount: 0,
        moderationLabels: [],
        moderationStatus: 'skipped',
        moderationProvider: moderationConfig.provider,
        skippedReason: 'rekognition_dependency_missing',
      }
    }

    return {
      hasHumans: false,
      humanFaceCount: 0,
      moderationLabels: [],
      moderationStatus: 'error',
      moderationProvider: moderationConfig.provider,
      skippedReason: 'rekognition_dependency_missing',
    }
  }

  const { DetectModerationLabelsCommand } = awsSdk as {
    DetectModerationLabelsCommand: new (args: unknown) => unknown
  }

  let client: RekognitionClientLike
  try {
    client = await getRekognitionClient()
  } catch (error) {
    if (moderationConfig.failOpen) {
      return {
        hasHumans: false,
        humanFaceCount: 0,
        moderationLabels: [],
        moderationStatus: 'skipped',
        moderationProvider: moderationConfig.provider,
        skippedReason: error instanceof Error ? error.message : 'moderation_client_error',
      }
    }

    return {
      hasHumans: false,
      humanFaceCount: 0,
      moderationLabels: [],
      moderationStatus: 'error',
      moderationProvider: moderationConfig.provider,
      skippedReason: error instanceof Error ? error.message : 'moderation_client_error',
    }
  }

  let moderationRaw: unknown
  try {
    moderationRaw = await client.send(
      new DetectModerationLabelsCommand({
        Image: { Bytes: bytes },
        MinConfidence: MIN_MODERATION_CONFIDENCE,
      })
    )
  } catch (error) {
    if (moderationConfig.failOpen) {
      return {
        hasHumans: false,
        humanFaceCount: 0,
        moderationLabels: [],
        moderationStatus: 'skipped',
        moderationProvider: moderationConfig.provider,
        skippedReason: error instanceof Error ? error.message : 'moderation_request_failed',
      }
    }

    return {
      hasHumans: false,
      humanFaceCount: 0,
      moderationLabels: [],
      moderationStatus: 'error',
      moderationProvider: moderationConfig.provider,
      skippedReason: error instanceof Error ? error.message : 'moderation_request_failed',
    }
  }

  const moderationResp = moderationRaw as { ModerationLabels?: Array<{ Name?: string | null; Confidence?: number | null } | null> }

  const moderationLabels: ModerationLabel[] = (moderationResp.ModerationLabels || [])
    .map((l) => ({
      name: l?.Name || 'Unknown',
      confidence: typeof l?.Confidence === 'number' ? l.Confidence : 0,
    }))
    .sort((a, b) => b.confidence - a.confidence)

  let moderationStatus: ModerationResult['moderationStatus'] = 'approved'

  if (moderationLabels.length > 0) {
    moderationStatus = 'rejected'
  }

  return {
    hasHumans: false,
    humanFaceCount: 0,
    moderationLabels,
    moderationStatus,
    moderationProvider: moderationConfig.provider,
    skippedReason: null,
  }
}

export async function moderateImageFromUrl(imageUrl: string): Promise<ModerationResult> {
  const bytes = await fetchImageBytes(imageUrl)

  return moderateImageBytes(bytes)
}

export async function moderateImageFromBytes(bytes: Uint8Array): Promise<ModerationResult> {
  return moderateImageBytes(bytes)
}

export type { ModerationLabel, ModerationResult }
