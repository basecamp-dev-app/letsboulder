import crypto from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'
import sharp from 'sharp'
import { RekognitionClient, DetectModerationLabelsCommand } from '@aws-sdk/client-rekognition'
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import { createClient } from '@supabase/supabase-js'

const pollIntervalMs = Number.parseInt(process.env.MEDIA_WORKER_POLL_INTERVAL_MS || '5000', 10)
const workerId = process.env.MEDIA_WORKER_ID || `media-worker-${process.pid}`
const executionEnabled = process.env.MEDIA_WORKER_EXECUTE_JOBS === 'true'
const minModerationConfidence = 60

const variantSpecs = [
  { key: 'thumb', width: 240 },
  { key: 'card', width: 640 },
  { key: 'detail', width: 1280 },
  { key: 'topo', width: 2048 },
  { key: 'full', width: 2560 },
]

const formatSpecs = [
  { key: 'avif', contentType: 'image/avif', extension: 'avif' },
  { key: 'webp', contentType: 'image/webp', extension: 'webp' },
  { key: 'jpeg', contentType: 'image/jpeg', extension: 'jpg' },
]

function getRequiredEnv(name) {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }

  return value
}

function parseBooleanEnv(value, defaultValue) {
  if (!value) return defaultValue
  const normalized = value.trim().toLowerCase()
  if (normalized === 'true') return true
  if (normalized === 'false') return false
  return defaultValue
}

function getSupabaseAdminClient() {
  return createClient(
    getRequiredEnv('NEXT_PUBLIC_SUPABASE_URL'),
    getRequiredEnv('SUPABASE_SERVICE_ROLE_KEY'),
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  )
}

function getStorageConfig() {
  return {
    endpoint: getRequiredEnv('R2_S3_ENDPOINT'),
    privateBucket: getRequiredEnv('R2_PRIVATE_BUCKET'),
    publicBucket: getRequiredEnv('R2_PUBLIC_BUCKET'),
    cdnBaseUrl: getRequiredEnv('MEDIA_CDN_BASE_URL').replace(/\/$/, ''),
    credentials: {
      accessKeyId: getRequiredEnv('R2_ACCESS_KEY_ID'),
      secretAccessKey: getRequiredEnv('R2_SECRET_ACCESS_KEY'),
    },
  }
}

function getModerationConfig() {
  const enabled = parseBooleanEnv(process.env.MEDIA_MODERATION_ENABLED, true)
  const provider = enabled && process.env.MEDIA_MODERATION_PROVIDER?.trim().toLowerCase() !== 'disabled'
    ? 'aws_rekognition'
    : 'disabled'

  return {
    enabled,
    provider,
    failOpen: parseBooleanEnv(process.env.MEDIA_MODERATION_FAIL_OPEN, false),
  }
}

function createR2Client() {
  const storage = getStorageConfig()

  return new S3Client({
    region: 'auto',
    endpoint: storage.endpoint,
    credentials: storage.credentials,
  })
}

let rekognitionClientPromise = null

async function getRekognitionClient() {
  if (!rekognitionClientPromise) {
    rekognitionClientPromise = Promise.resolve().then(() => new RekognitionClient({
      region: getRequiredEnv('AWS_REGION'),
      credentials: {
        accessKeyId: getRequiredEnv('AWS_ACCESS_KEY_ID'),
        secretAccessKey: getRequiredEnv('AWS_SECRET_ACCESS_KEY'),
      },
    }))
  }

  return rekognitionClientPromise
}

async function streamToBuffer(stream) {
  const chunks = []
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks)
}

async function claimNextJob(supabase) {
  const { data, error } = await supabase.rpc('claim_media_job', { worker_name: workerId })
  if (error) {
    throw error
  }

  return data || null
}

async function loadImageRow(supabase, imageId) {
  const { data, error } = await supabase
    .from('images')
    .select([
      'id',
      'url',
      'created_by',
      'storage_provider',
      'original_bucket',
      'original_key',
      'original_mime_type',
      'original_bytes',
      'original_width',
      'original_height',
      'asset_version',
      'variants',
      'visibility',
      'processing_status',
      'moderation_status',
      'moderation_provider',
      'moderation_error',
      'moderation_labels',
      'moderated_at',
      'status',
    ].join(', '))
    .eq('id', imageId)
    .single()

  if (error) {
    throw error
  }

  return data
}

async function downloadOriginalBuffer(r2, bucket, key) {
  const response = await r2.send(new GetObjectCommand({ Bucket: bucket, Key: key }))
  if (!response.Body) {
    throw new Error('Original image body is empty')
  }

  return streamToBuffer(response.Body)
}

async function moderateImage(buffer) {
  const config = getModerationConfig()
  if (!config.enabled || config.provider === 'disabled') {
    return {
      moderationStatus: 'skipped',
      moderationProvider: 'disabled',
      moderationLabels: [],
      moderationError: 'moderation_disabled',
    }
  }

  try {
    const client = await getRekognitionClient()
    const response = await client.send(new DetectModerationLabelsCommand({
      Image: { Bytes: buffer },
      MinConfidence: minModerationConfidence,
    }))

    const moderationLabels = (response.ModerationLabels || [])
      .map((item) => ({
        name: item?.Name || 'Unknown',
        confidence: typeof item?.Confidence === 'number' ? item.Confidence : 0,
      }))
      .sort((a, b) => b.confidence - a.confidence)

    return {
      moderationStatus: moderationLabels.length > 0 ? 'rejected' : 'approved',
      moderationProvider: 'aws_rekognition',
      moderationLabels,
      moderationError: null,
    }
  } catch (error) {
    if (config.failOpen) {
      return {
        moderationStatus: 'skipped',
        moderationProvider: 'aws_rekognition',
        moderationLabels: [],
        moderationError: error instanceof Error ? error.message : 'moderation_failed',
      }
    }

    return {
      moderationStatus: 'error',
      moderationProvider: 'aws_rekognition',
      moderationLabels: [],
      moderationError: error instanceof Error ? error.message : 'moderation_failed',
    }
  }
}

async function buildVariant(buffer, width, formatKey) {
  let pipeline = sharp(buffer, { failOn: 'none' }).rotate().resize({ width, withoutEnlargement: true })

  if (formatKey === 'avif') {
    pipeline = pipeline.avif({ quality: 50 })
  } else if (formatKey === 'webp') {
    pipeline = pipeline.webp({ quality: 75 })
  } else {
    pipeline = pipeline.jpeg({ quality: 82, mozjpeg: true })
  }

  const { data, info } = await pipeline.toBuffer({ resolveWithObject: true })
  return { buffer: data, width: info.width, height: info.height, bytes: info.size }
}

async function uploadVariants(r2, image, originalBuffer) {
  const storage = getStorageConfig()
  const assetVersion = Math.max(1, Number(image.asset_version || 1))
  const manifest = {}
  let detailJpegPath = null
  let derivedWidth = null
  let derivedHeight = null

  for (const variant of variantSpecs) {
    manifest[variant.key] = {}

    for (const format of formatSpecs) {
      const generated = await buildVariant(originalBuffer, variant.width, format.key)
      const objectPath = `images/${image.id}/v${assetVersion}/${variant.key}.${format.extension}`

      await r2.send(new PutObjectCommand({
        Bucket: storage.publicBucket,
        Key: objectPath,
        Body: generated.buffer,
        ContentType: format.contentType,
        CacheControl: 'public, max-age=31536000, immutable',
      }))

      manifest[variant.key][format.key] = {
        path: objectPath,
        width: generated.width,
        height: generated.height,
        bytes: generated.bytes,
        contentType: format.contentType,
      }

      if (variant.key === 'detail' && format.key === 'jpeg') {
        detailJpegPath = objectPath
        derivedWidth = generated.width
        derivedHeight = generated.height
      }
    }
  }

  return {
    assetVersion,
    manifest,
    publicUrl: detailJpegPath ? `${storage.cdnBaseUrl}/${detailJpegPath}` : image.url,
    derivedWidth,
    derivedHeight,
  }
}

async function completeJob(supabase, jobId) {
  const { error } = await supabase
    .from('media_jobs')
    .update({
      status: 'completed',
      locked_at: null,
      locked_by: null,
      last_error: null,
    })
    .eq('id', jobId)

  if (error) {
    throw error
  }
}

async function failJob(supabase, job, errorMessage, terminal) {
  const runAt = new Date(Date.now() + Math.min(300000, 15000 * Math.max(1, job.attempts))).toISOString()
  const nextStatus = terminal || job.attempts >= job.max_attempts ? 'failed' : 'queued'
  const payload = {
    status: nextStatus,
    locked_at: null,
    locked_by: null,
    last_error: errorMessage,
    run_at: nextStatus === 'queued' ? runAt : new Date().toISOString(),
  }

  const { error } = await supabase
    .from('media_jobs')
    .update(payload)
    .eq('id', job.id)

  if (error) {
    throw error
  }
}

async function updateImageAfterFailure(supabase, imageId, errorMessage, terminal) {
  const { error } = await supabase
    .from('images')
    .update({
      processing_status: terminal ? 'failed' : 'queued',
      moderation_error: errorMessage,
    })
    .eq('id', imageId)

  if (error) {
    throw error
  }
}

async function processClaimedJob(supabase, r2, job) {
  const payload = job.payload && typeof job.payload === 'object' ? job.payload : {}
  const imageId = typeof payload.imageId === 'string' ? payload.imageId : job.image_id
  if (!imageId) {
    throw new Error('Job payload is missing imageId')
  }

  const image = await loadImageRow(supabase, imageId)

  if (image.processing_status === 'ready' && image.visibility === 'public' && image.variants && Object.keys(image.variants).length > 0) {
    await completeJob(supabase, job.id)
    return
  }

  const originalBucket = image.original_bucket || payload.originalBucket || getStorageConfig().privateBucket
  const originalKey = image.original_key || payload.originalKey
  if (!originalKey) {
    throw new Error('Image original key is missing')
  }

  const { error: processingError } = await supabase
    .from('images')
    .update({
      processing_status: 'processing',
    })
    .eq('id', image.id)

  if (processingError) {
    throw processingError
  }

  const originalBuffer = await downloadOriginalBuffer(r2, originalBucket, originalKey)
  const checksum = crypto.createHash('sha256').update(originalBuffer).digest('hex')
  const moderation = await moderateImage(originalBuffer)
  const moderatedAt = new Date().toISOString()

  if (moderation.moderationStatus === 'rejected') {
    const { error } = await supabase
      .from('images')
      .update({
        moderation_status: 'rejected',
        moderation_provider: moderation.moderationProvider,
        moderation_labels: moderation.moderationLabels,
        moderation_error: moderation.moderationError,
        moderated_at: moderatedAt,
        visibility: 'private',
        processing_status: 'failed',
        status: 'rejected',
        checksum_sha256: checksum,
      })
      .eq('id', image.id)

    if (error) {
      throw error
    }

    await completeJob(supabase, job.id)
    return
  }

  if (moderation.moderationStatus === 'error') {
    throw new Error(moderation.moderationError || 'Moderation failed')
  }

  const uploaded = await uploadVariants(r2, image, originalBuffer)

  const { error } = await supabase
    .from('images')
    .update({
      url: uploaded.publicUrl,
      storage_provider: 'r2',
      original_bucket: originalBucket,
      original_key: originalKey,
      original_bytes: originalBuffer.byteLength,
      original_width: image.original_width || uploaded.derivedWidth,
      original_height: image.original_height || uploaded.derivedHeight,
      asset_version: uploaded.assetVersion,
      variants: uploaded.manifest,
      visibility: 'public',
      moderation_status: moderation.moderationStatus,
      moderation_provider: moderation.moderationProvider,
      moderation_labels: moderation.moderationLabels,
      moderation_error: moderation.moderationError,
      moderated_at: moderatedAt,
      processing_status: 'ready',
      processed_at: new Date().toISOString(),
      checksum_sha256: checksum,
      status: 'approved',
      width: uploaded.derivedWidth || image.width,
      height: uploaded.derivedHeight || image.height,
    })
    .eq('id', image.id)

  if (error) {
    throw error
  }

  await completeJob(supabase, job.id)
}

async function processOneJob() {
  const supabase = getSupabaseAdminClient()
  const job = await claimNextJob(supabase)

  if (!job) {
    return false
  }

  console.log(`[${workerId}] claimed job ${job.id} for image ${job.image_id}`)

  const r2 = createR2Client()

  try {
    await processClaimedJob(supabase, r2, job)
    console.log(`[${workerId}] completed job ${job.id}`)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown ingest failure'
    console.error(`[${workerId}] failed job ${job.id}`, error)
    await updateImageAfterFailure(supabase, job.image_id, message, job.attempts >= job.max_attempts)
    await failJob(supabase, job, message, false)
  }

  return true
}

let tickInFlight = false

async function tick() {
  if (tickInFlight) {
    return
  }

  tickInFlight = true

  try {
    if (!executionEnabled) {
      console.log(`[${workerId}] MEDIA_WORKER_EXECUTE_JOBS is disabled; worker is running in observe-only mode`)
      return
    }

    while (await processOneJob()) {
      // Drain available work before sleeping.
    }
  } catch (error) {
    console.error(`[${workerId}] media worker poll failed`, error)
  } finally {
    tickInFlight = false
  }
}

console.log(`[${workerId}] media worker started (poll interval ${pollIntervalMs}ms)`)
void tick()

while (true) {
  await delay(pollIntervalMs)
  await tick()
}
