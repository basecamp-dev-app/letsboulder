import { DetectFacesCommand, DetectModerationLabelsCommand, RekognitionClient } from '@aws-sdk/client-rekognition'

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

function getRekognitionClient(): RekognitionClient {
  const region = process.env.AWS_REGION
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY

  if (!region || !accessKeyId || !secretAccessKey) {
    throw new Error('Missing AWS Rekognition environment variables')
  }

  return new RekognitionClient({
    region,
    credentials: { accessKeyId, secretAccessKey },
  })
}

async function fetchImageBytes(imageUrl: string): Promise<Uint8Array> {
  const res = await fetch(imageUrl)
  if (!res.ok) {
    throw new Error(`Failed to fetch image bytes: ${res.status}`)
  }
  const buf = await res.arrayBuffer()
  return new Uint8Array(buf)
}

export async function moderateImageFromUrl(imageUrl: string): Promise<ModerationResult> {
  const client = getRekognitionClient()
  const bytes = await fetchImageBytes(imageUrl)

  const [moderationResp, facesResp] = await Promise.all([
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

  const moderationLabels: ModerationLabel[] = (moderationResp.ModerationLabels || [])
    .map((l) => ({
      name: l.Name || 'Unknown',
      confidence: typeof l.Confidence === 'number' ? l.Confidence : 0,
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

export type { ModerationLabel, ModerationResult }
