const MIN_MODERATION_CONFIDENCE = 60

interface ModerationLabel {
  name: string
  confidence: number
}

interface ModerationResult {
  hasHumans: boolean
  humanFaceCount: number
  moderationLabels: ModerationLabel[]
  moderationStatus: 'approved' | 'flagged' | 'rejected'
}

type RekognitionClientLike = {
  send: (command: unknown) => Promise<unknown>
}

async function getRekognitionClient(): Promise<RekognitionClientLike> {
  const region = process.env.AWS_REGION
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY

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
  const awsSdk = await eval("import('@aws-sdk/client-rekognition')").catch(() => null) as unknown
  if (!awsSdk) {
    return {
      hasHumans: false,
      humanFaceCount: 0,
      moderationLabels: [],
      moderationStatus: 'approved',
    }
  }

  const { DetectModerationLabelsCommand, DetectFacesCommand } = awsSdk as {
    DetectModerationLabelsCommand: new (args: unknown) => unknown
    DetectFacesCommand: new (args: unknown) => unknown
  }

  const client = await getRekognitionClient()

  const [moderationRaw, facesRaw] = await Promise.all([
    client.send(
      new DetectModerationLabelsCommand({
        Image: { Bytes: bytes },
        MinConfidence: MIN_MODERATION_CONFIDENCE,
      })
    ),
    client.send(
      new DetectFacesCommand({
        Image: { Bytes: bytes },
        Attributes: ['DEFAULT'],
      })
    ),
  ])

  const moderationResp = moderationRaw as { ModerationLabels?: Array<{ Name?: string | null; Confidence?: number | null } | null> }
  const facesResp = facesRaw as { FaceDetails?: unknown[] | null }

  const moderationLabels: ModerationLabel[] = (moderationResp.ModerationLabels || [])
    .map((l) => ({
      name: l?.Name || 'Unknown',
      confidence: typeof l?.Confidence === 'number' ? l.Confidence : 0,
    }))
    .sort((a, b) => b.confidence - a.confidence)

  const humanFaceCount = facesResp.FaceDetails?.length || 0
  const hasHumans = humanFaceCount > 0

  let moderationStatus: ModerationResult['moderationStatus'] = 'approved'

  if (moderationLabels.length > 0) {
    moderationStatus = 'rejected'
  } else if (hasHumans) {
    moderationStatus = 'rejected'
  }

  return {
    hasHumans,
    humanFaceCount,
    moderationLabels,
    moderationStatus,
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
