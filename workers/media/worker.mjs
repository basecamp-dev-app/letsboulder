import path from 'node:path'
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

const MIME_EXTENSION_MAP = {
  'image/avif': 'avif',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

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

function isR2ManagedBucket(bucket) {
  const storage = getStorageConfig()
  return bucket === storage.privateBucket || bucket === storage.publicBucket
}

function getExtensionFromMimeType(contentType) {
  if (!contentType) return null
  return MIME_EXTENSION_MAP[contentType.toLowerCase()] || null
}

function inferOriginalExtension(contentType, objectKey) {
  const fromMime = getExtensionFromMimeType(contentType)
  if (fromMime) {
    return fromMime
  }

  const parsed = path.extname(objectKey || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase()
  if (parsed) {
    return parsed
  }

  return 'jpg'
}

function buildPrivateOriginalKey(imageId, contentType, objectKey) {
  const extension = inferOriginalExtension(contentType, objectKey)
  return `images/originals/${imageId}/original.${extension}`
}

function buildPrivateObjectUrl(bucket, objectKey) {
  return `private://${bucket}/${objectKey}`
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

  if (!data || typeof data !== 'object') {
    return null
  }

  const candidate = data
  if (!candidate.id || !candidate.image_id) {
    return null
  }

  return candidate
}

async function loadImageRow(supabase, imageId) {
  const { data, error } = await supabase
    .from('images')
    .select([
      'id',
      'url',
      'created_by',
      'storage_bucket',
      'storage_path',
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
      'width',
      'height',
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

  return {
    buffer: await streamToBuffer(response.Body),
    contentType: response.ContentType || null,
  }
}

async function downloadLegacyOriginalBuffer(supabase, bucket, key) {
  const { data, error } = await supabase.storage.from(bucket).download(key)
  if (error || !data) {
    throw error || new Error('Failed to download legacy original image')
  }

  return {
    buffer: Buffer.from(await data.arrayBuffer()),
    contentType: data.type || null,
  }
}

async function downloadSourceOriginal(supabase, r2, bucket, key) {
  if (isR2ManagedBucket(bucket)) {
    return downloadOriginalBuffer(r2, bucket, key)
  }

  return downloadLegacyOriginalBuffer(supabase, bucket, key)
}

async function uploadOriginalToPrivateBucket(r2, imageId, buffer, contentType, sourceKey) {
  const storage = getStorageConfig()
  const objectKey = buildPrivateOriginalKey(imageId, contentType, sourceKey)

  await r2.send(new PutObjectCommand({
    Bucket: storage.privateBucket,
    Key: objectKey,
    Body: buffer,
    ContentType: contentType || 'application/octet-stream',
  }))

  return {
    bucket: storage.privateBucket,
    key: objectKey,
  }
}

async function readImageMetadata(buffer) {
  const metadata = await sharp(buffer, { failOn: 'none' }).metadata()

  return {
    width: typeof metadata.width === 'number' ? metadata.width : null,
    height: typeof metadata.height === 'number' ? metadata.height : null,
  }
}

function getPreservedBackfillModeration(image, trigger) {
  if (trigger !== 'backfill') {
    return null
  }

  if (
    image.moderation_status !== 'approved'
    && image.moderation_status !== 'skipped'
    && image.moderation_status !== 'rejected'
  ) {
    return null
  }

  return {
    moderationStatus: image.moderation_status,
    moderationProvider: image.moderation_provider || 'disabled',
    moderationLabels: Array.isArray(image.moderation_labels) ? image.moderation_labels : [],
    moderationError: image.moderation_error || null,
  }
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
  if (!job?.id) {
    return
  }

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
  if (!imageId) {
    return
  }

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
  const trigger = payload.trigger === 'backfill' ? 'backfill' : 'upload'
  if (!imageId) {
    throw new Error('Job payload is missing imageId')
  }

  const image = await loadImageRow(supabase, imageId)

  if (image.processing_status === 'ready' && image.visibility === 'public' && image.variants && Object.keys(image.variants).length > 0) {
    await completeJob(supabase, job.id)
    return
  }

  const sourceBucket = image.original_bucket || payload.originalBucket || image.storage_bucket || getStorageConfig().privateBucket
  const sourceKey = image.original_key || payload.originalKey || image.storage_path
  if (!sourceBucket || !sourceKey) {
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

  const storage = getStorageConfig()
  const originalAsset = await downloadSourceOriginal(supabase, r2, sourceBucket, sourceKey)
  const checksum = crypto.createHash('sha256').update(originalAsset.buffer).digest('hex')
  const originalMetadata = await readImageMetadata(originalAsset.buffer)
  const copiedOriginal = sourceBucket === storage.privateBucket
    ? { bucket: sourceBucket, key: sourceKey }
    : await uploadOriginalToPrivateBucket(
        r2,
        image.id,
        originalAsset.buffer,
        originalAsset.contentType || image.original_mime_type,
        sourceKey
      )
  const moderation = getPreservedBackfillModeration(image, trigger) || await moderateImage(originalAsset.buffer)
  const moderatedAt = image.moderated_at || new Date().toISOString()

  if (moderation.moderationStatus === 'rejected') {
    const { error } = await supabase
      .from('images')
      .update({
        url: buildPrivateObjectUrl(copiedOriginal.bucket, copiedOriginal.key),
        storage_provider: 'r2',
        moderation_status: 'rejected',
        moderation_provider: moderation.moderationProvider,
        moderation_labels: moderation.moderationLabels,
        moderation_error: moderation.moderationError,
        moderated_at: moderatedAt,
        original_bucket: copiedOriginal.bucket,
        original_key: copiedOriginal.key,
        original_mime_type: originalAsset.contentType || image.original_mime_type,
        original_bytes: originalAsset.buffer.byteLength,
        original_width: image.original_width || originalMetadata.width || image.width,
        original_height: image.original_height || originalMetadata.height || image.height,
        visibility: 'private',
        processing_status: trigger === 'backfill' ? 'ready' : 'failed',
        status: 'rejected',
        checksum_sha256: checksum,
        processed_at: new Date().toISOString(),
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

  const uploaded = await uploadVariants(r2, image, originalAsset.buffer)

  const { error } = await supabase
    .from('images')
    .update({
      url: uploaded.publicUrl,
      storage_provider: 'r2',
      original_bucket: copiedOriginal.bucket,
      original_key: copiedOriginal.key,
      original_mime_type: originalAsset.contentType || image.original_mime_type,
      original_bytes: originalAsset.buffer.byteLength,
      original_width: image.original_width || originalMetadata.width || uploaded.derivedWidth,
      original_height: image.original_height || originalMetadata.height || uploaded.derivedHeight,
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
