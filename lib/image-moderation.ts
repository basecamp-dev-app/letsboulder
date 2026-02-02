import {
  RekognitionClient,
  DetectModerationLabelsCommand,
  DetectFacesCommand,
  DetectLabelsCommand,
} from '@aws-sdk/client-rekognition'

const MIN_MODERATION_CONFIDENCE = 60
const MIN_PERSON_LABEL_CONFIDENCE = 80

interface ModerationLabel {
  name: string
  confidence: number
}

interface ModerationResult {
  hasHumans: boolean
  humanFaceCount: number
  hasPeople: boolean
  personLabelConfidence: number | null
  moderationLabels: ModerationLabel[]
  moderationStatus: 'approved' | 'rejected'
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

  const [moderationResp, facesResp, labelsResp] = await Promise.all([
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
    client.send(
      new DetectLabelsCommand({
        Image: { Bytes: bytes },
        MinConfidence: MIN_PERSON_LABEL_CONFIDENCE,
        MaxLabels: 25,
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

  const personLabel = (labelsResp.Labels || []).find((l) => l.Name === 'Person')
  const personLabelConfidence = typeof personLabel?.Confidence === 'number' ? personLabel.Confidence : null
  const hasPeople = !!personLabel

  let moderationStatus: ModerationResult['moderationStatus'] = 'approved'

  if (moderationLabels.length > 0) {
    moderationStatus = 'rejected'
  } else if (hasPeople || hasHumans) {
    moderationStatus = 'rejected'
  }

  return {
    hasHumans,
    humanFaceCount,
    hasPeople,
    personLabelConfidence,
    moderationLabels,
    moderationStatus,
  }
}

export type { ModerationLabel, ModerationResult }
