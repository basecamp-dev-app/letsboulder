import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'

import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { Client, type QueryResultRow } from 'pg'
import sharp from 'sharp'

const BUCKET = 'lb-prod-media-private'
const MAX_SOURCE_BYTES = 50 * 1024 * 1024
const CANONICAL_MIME = 'image/webp'
const CACHE_CONTROL = 'public, max-age=31536000, immutable'
const RESULT_PATH = process.env.MIGRATION_RESULT?.trim() || 'media-canonical-migration-result.json'
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type Candidate = { imageId: string; sourceKey: string; sourceBytes: number }
type ResultItem = {
  imageId: string
  status: 'validated' | 'migrated' | 'failed'
  canonicalKey?: string
  deletionJobId?: string
  error?: string
}
type ImageRow = QueryResultRow & {
  id: string
  status: string
  processing_status: string
  visibility: string
  moderation_status: string | null
  storage_provider: string
  storage_bucket: string | null
  storage_path: string | null
  original_bucket: string | null
  original_key: string | null
  original_bytes: string | number | null
  optimized_bucket: string | null
  optimized_key: string | null
  asset_version: number
  crag_id: string | null
  crag_deleted_at: string | null
  public_live: boolean
  crag_live: boolean
  route_live: boolean
}
type ImageSnapshot = QueryResultRow & {
  width: unknown
  height: unknown
  storage_provider: unknown
  optimized_bucket: unknown
  optimized_key: unknown
  optimized_mime: unknown
  optimized_bytes: unknown
  optimized_width: unknown
  optimized_height: unknown
  storage_bucket: unknown
  storage_path: unknown
  original_bucket: unknown
  original_key: unknown
  original_mime_type: unknown
  original_bytes: unknown
  original_width: unknown
  original_height: unknown
  asset_version: unknown
  variants: unknown
  url: unknown
  visibility: unknown
  moderation_status: unknown
  moderation_provider: unknown
  moderation_labels: unknown
  moderation_error: unknown
  moderated_at: unknown
  processing_status: unknown
  checksum_sha256: unknown
  status: unknown
  processed_at: unknown
  original_deletion_queued_at: unknown
  original_deleted_at: unknown
}
type DraftSnapshot = QueryResultRow & {
  id: string
  storage_bucket: unknown
  storage_path: unknown
  width: unknown
  height: unknown
  processing_status: unknown
  updated_at: unknown
}
type CragSnapshot = QueryResultRow & {
  id: string
  url: unknown
  width: unknown
  height: unknown
}
type CommitSnapshot = {
  image: ImageSnapshot
  drafts: DraftSnapshot[]
  cragImages: CragSnapshot[]
}
type PublicRow = QueryResultRow & { url: string; asset_version: number }
type UrlRow = QueryResultRow & { url: string }

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Missing required environment variable: ${name}`)
  return value
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : 'Unknown migration error'
  return message.replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 2_000)
}

function normalizedContentType(value: string | null | undefined): string | null {
  return value?.split(';', 1)[0]?.trim().toLowerCase() || null
}

function parseBoolean(value: string): boolean {
  if (value === 'true') return true
  if (value === 'false') return false
  throw new Error('DRY_RUN must be true or false')
}

function parseBatchSize(value: string): number {
  const size = Number(value)
  if (!Number.isInteger(size) || size < 1 || size > 25) {
    throw new Error('BATCH_SIZE must be an integer between 1 and 25')
  }
  return size
}

function encodeObjectPath(key: string): string {
  return key.split('/').filter(Boolean).map(encodeURIComponent).join('/')
}

function resolvePublicUrl(value: string, cdnUrl: string): string {
  if (value.startsWith('private://')) {
    const match = /^private:\/\/[^/]+\/(.+)$/.exec(value)
    if (!match) throw new Error('Invalid private media URL')
    return `${cdnUrl}/${encodeObjectPath(match[1])}?variant=detail&format=webp`
  }
  if (value.startsWith('/')) return `${cdnUrl}${value}`
  const parsed = new URL(value)
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') throw new Error('Unsupported media URL')
  return parsed.toString()
}

function buildVariantPath(key: string, variant: 'detail' | 'topo'): string {
  return `/${encodeObjectPath(key)}?variant=${variant}&format=webp`
}

function buildManifest(key: string, width: number, height: number): Record<string, unknown> {
  const variantWidths = { thumb: 240, card: 640, detail: 1280, topo: 2048, full: 2560 }
  const manifest: Record<string, unknown> = {}
  for (const [variant, configuredWidth] of Object.entries(variantWidths)) {
    const outputWidth = Math.min(configuredWidth, width)
    const outputHeight = Math.max(1, Math.round(height * (outputWidth / width)))
    manifest[variant] = {
      webp: {
        path: `/${encodeObjectPath(key)}?variant=${variant}&format=webp`,
        width: outputWidth,
        height: outputHeight,
        contentType: CANONICAL_MIME,
      },
      avif: {
        path: `/${encodeObjectPath(key)}?variant=${variant}&format=avif`,
        width: outputWidth,
        height: outputHeight,
        contentType: 'image/avif',
      },
      jpeg: {
        path: `/${encodeObjectPath(key)}?variant=${variant}&format=jpeg`,
        width: outputWidth,
        height: outputHeight,
        contentType: 'image/jpeg',
      },
    }
  }
  return manifest
}

function parseCandidates(input: unknown): Candidate[] {
  if (!isRecord(input) || !isRecord(input.imageClassifications)) {
    throw new Error('Reconciliation input has an invalid schema')
  }
  const category = input.imageClassifications.liveReferencedUncanonicalized
  if (!Array.isArray(category)) throw new Error('Reconciliation input is missing the candidate category')
  const candidates = category.map((item): Candidate => {
    if (!isRecord(item) || typeof item.imageId !== 'string' || !UUID_PATTERN.test(item.imageId)
      || !Array.isArray(item.sourceKeys) || item.sourceKeys.length !== 1
      || typeof item.sourceKeys[0] !== 'string' || !item.sourceKeys[0]) {
      throw new Error('Reconciliation input contains an invalid candidate')
    }
    if (typeof item.sourceBytes !== 'number' || !Number.isSafeInteger(item.sourceBytes) || item.sourceBytes < 1) {
      throw new Error('Reconciliation input contains invalid candidate source bytes')
    }
    return { imageId: item.imageId, sourceKey: item.sourceKeys[0], sourceBytes: item.sourceBytes }
  })
  candidates.sort((left, right) => left.imageId < right.imageId ? -1 : left.imageId > right.imageId ? 1 : 0)
  return candidates
}

async function cloudflareCredentials(): Promise<{ accessKeyId: string; secretAccessKey: string }> {
  const token = requiredEnv('CLOUDFLARE_API_TOKEN')
  const response = await fetch('https://api.cloudflare.com/client/v4/user/tokens/verify', {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(30_000),
  })
  const body: unknown = await response.json().catch(() => null)
  if (!response.ok || !isRecord(body) || body.success !== true || !isRecord(body.result)
    || body.result.status !== 'active' || typeof body.result.id !== 'string' || !body.result.id) {
    throw new Error('Cloudflare API token is not active or could not be verified')
  }
  return {
    accessKeyId: body.result.id,
    secretAccessKey: createHash('sha256').update(token).digest('hex'),
  }
}

async function createDatabaseClient(): Promise<Client> {
  const port = Number.parseInt(requiredEnv('SUPABASE_DB_PORT'), 10)
  if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error('SUPABASE_DB_PORT is invalid')
  const client = new Client({
    host: requiredEnv('SUPABASE_DB_HOST'),
    port,
    user: requiredEnv('SUPABASE_DB_USER'),
    database: requiredEnv('SUPABASE_DB_NAME'),
    password: requiredEnv('PGPASSWORD'),
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 30_000,
    query_timeout: 120_000,
  })
  await client.connect()
  return client
}

async function loadAndValidateImage(client: Client, candidate: Candidate, lock: boolean): Promise<ImageRow> {
  const result = await client.query<ImageRow>(`
    SELECT i.id, i.status, i.processing_status, i.visibility, i.moderation_status,
      i.storage_provider, i.storage_bucket, i.storage_path, i.original_bucket,
      i.original_key, i.original_bytes, i.optimized_bucket, i.optimized_key,
      i.asset_version, i.crag_id, c.deleted_at::text AS crag_deleted_at,
      (i.status = 'approved' AND i.processing_status = 'ready'
        AND i.visibility = 'public' AND i.moderation_status IN ('approved', 'skipped')) AS public_live,
      EXISTS (
        SELECT 1 FROM public.crag_images ci
        JOIN public.crags linked_crag ON linked_crag.id = ci.crag_id AND linked_crag.deleted_at IS NULL
        WHERE ci.linked_image_id = i.id OR ci.source_image_id = i.id
          OR ci.url = 'private://' || i.original_bucket || '/' || i.original_key
      ) AS crag_live,
      EXISTS (SELECT 1 FROM public.route_lines rl WHERE rl.image_id = i.id) AS route_live
    FROM public.images i
    LEFT JOIN public.crags c ON c.id = i.crag_id
    WHERE i.id = $1
    ${lock ? 'FOR UPDATE OF i' : ''}
  `, [candidate.imageId])
  const image = result.rows[0]
  if (!image) throw new Error('Candidate image no longer exists')
  if (image.status !== 'approved' || image.processing_status !== 'ready' || image.visibility !== 'public'
    || (image.moderation_status !== 'approved' && image.moderation_status !== 'skipped')) {
    throw new Error('Candidate is no longer approved, ready, moderated, and public')
  }
  if (image.crag_id && image.crag_deleted_at) throw new Error('Candidate belongs to a deleted crag')
  if (!image.public_live && !image.crag_live && !image.route_live) throw new Error('Candidate is no longer live')
  if (image.storage_provider !== 'r2' || image.original_bucket !== BUCKET
    || image.original_key !== candidate.sourceKey || image.storage_bucket !== BUCKET
    || image.storage_path !== candidate.sourceKey) {
    throw new Error('Candidate original locator or provider has changed')
  }
  if (image.optimized_key !== null || image.optimized_bucket !== null) {
    throw new Error('Candidate already has an optimized locator')
  }
  return image
}

function expectedSourceBytes(image: ImageRow): number {
  const bytes = typeof image.original_bytes === 'string' ? Number(image.original_bytes) : image.original_bytes
  if (!Number.isSafeInteger(bytes) || !bytes || bytes < 1) throw new Error('Candidate has invalid original byte metadata')
  return bytes
}

async function validateHead(s3: S3Client, image: ImageRow, candidate: Candidate): Promise<number> {
  const response = await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: image.original_key as string }))
  const bytes = response.ContentLength
  if (!Number.isSafeInteger(bytes) || !bytes || bytes < 1) throw new Error('Original object is missing or empty')
  if (bytes !== candidate.sourceBytes) throw new Error('Original object size has drifted from reconciliation')
  if (bytes !== expectedSourceBytes(image)) throw new Error('Original object size has drifted from database metadata')
  if (bytes > MAX_SOURCE_BYTES) throw new Error('Original object exceeds the 50 MiB migration limit')
  return bytes
}

async function verifyPublicImage(url: string, requireWebp: boolean): Promise<void> {
  const response = await fetch(url, { method: 'GET', redirect: 'follow', signal: AbortSignal.timeout(60_000) })
  const contentType = normalizedContentType(response.headers.get('Content-Type'))
  if (response.status !== 200 || !contentType?.startsWith('image/')
    || (requireWebp && contentType !== CANONICAL_MIME)) {
    await response.body?.cancel().catch(() => undefined)
    throw new Error(`Public image verification failed with status ${response.status}`)
  }
  if ((await response.arrayBuffer()).byteLength === 0) throw new Error('Public image verification returned an empty body')
}

async function captureCommitSnapshot(client: Client, image: ImageRow): Promise<CommitSnapshot> {
  const imageResult = await client.query<ImageSnapshot>(`
    SELECT width, height, storage_provider,
      optimized_bucket, optimized_key, optimized_mime, optimized_bytes,
      optimized_width, optimized_height, storage_bucket, storage_path, variants,
      original_bucket, original_key, original_mime_type, original_bytes,
      original_width, original_height, asset_version,
      url, visibility, moderation_status, moderation_provider, moderation_labels,
      moderation_error, moderated_at, processing_status, status, processed_at,
      checksum_sha256, original_deletion_queued_at, original_deleted_at
    FROM public.images WHERE id = $1
  `, [image.id])
  const drafts = await client.query<DraftSnapshot>(`
    SELECT id, storage_bucket, storage_path, width, height, processing_status, updated_at
    FROM public.submission_draft_images
    WHERE linked_image_id = $1 OR (storage_bucket = $2 AND storage_path = $3)
    FOR UPDATE
  `, [image.id, image.original_bucket, image.original_key])
  const cragImages = await client.query<CragSnapshot>(`
    SELECT id, url, width, height FROM public.crag_images
    WHERE linked_image_id = $1 OR source_image_id = $1
      OR url = 'private://' || $2::text || '/' || $3::text
    FOR UPDATE
  `, [image.id, image.original_bucket, image.original_key])
  const snapshot = imageResult.rows[0]
  if (!snapshot) throw new Error('Could not capture image state')
  return { image: snapshot, drafts: drafts.rows, cragImages: cragImages.rows }
}

async function commitCanonical(
  client: Client,
  candidate: Candidate,
  canonical: { key: string; bytes: number; width: number; height: number; manifest: Record<string, unknown>; url: string },
): Promise<{ jobId: string; snapshot: CommitSnapshot }> {
  await client.query('BEGIN')
  try {
    await client.query('SET LOCAL ROLE service_role')
    await client.query("SELECT set_config('request.jwt.claims', '{\"role\":\"service_role\"}', true)")
    const image = await loadAndValidateImage(client, candidate, true)
    const snapshot = await captureCommitSnapshot(client, image)
    const result = await client.query<{ job_id: string }>(`
      SELECT public.commit_media_webp($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11) AS job_id
    `, [
      image.id, image.original_bucket, image.original_key, BUCKET, canonical.key,
      CANONICAL_MIME, canonical.bytes, canonical.width, canonical.height,
      JSON.stringify(canonical.manifest), canonical.url,
    ])
    const jobId = result.rows[0]?.job_id
    if (!jobId || !UUID_PATTERN.test(jobId)) throw new Error('Canonical commit did not return a deletion job UUID')
    await client.query('COMMIT')
    return { jobId, snapshot }
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  }
}

async function currentDeliveryUrls(client: Client, imageId: string, canonicalKey: string, cdnUrl: string): Promise<string[]> {
  const imageResult = await client.query<PublicRow>(
    'SELECT url, asset_version FROM public.images WHERE id = $1', [imageId],
  )
  const image = imageResult.rows[0]
  if (!image || typeof image.url !== 'string' || !Number.isInteger(image.asset_version)) {
    throw new Error('Committed public image metadata is invalid')
  }
  const cragResult = await client.query<UrlRow>(`
    SELECT ci.url FROM public.crag_images ci
    JOIN public.crags c ON c.id = ci.crag_id AND c.deleted_at IS NULL
    WHERE ci.linked_image_id = $1 OR ci.source_image_id = $1
      OR ci.url = 'private://' || $2::text || '/' || $3::text
  `, [imageId, BUCKET, canonicalKey])
  const urls = new Set<string>([
    resolvePublicUrl(image.url, cdnUrl),
    `${cdnUrl}/images/${encodeURIComponent(imageId)}/v${image.asset_version}/detail.webp`,
    `${cdnUrl}/images/${encodeURIComponent(imageId)}/v${image.asset_version}/topo.webp`,
  ])
  for (const row of cragResult.rows) urls.add(resolvePublicUrl(row.url, cdnUrl))
  return [...urls]
}

async function rollbackCommit(
  client: Client,
  imageId: string,
  key: string,
  jobId: string,
  snapshot: CommitSnapshot,
): Promise<void> {
  await client.query('BEGIN')
  try {
    await client.query('SET LOCAL ROLE service_role')
    await client.query("SELECT set_config('request.jwt.claims', '{\"role\":\"service_role\"}', true)")
    const locked = await client.query(
      'SELECT id FROM public.images WHERE id = $1 AND optimized_bucket = $2 AND optimized_key = $3 FOR UPDATE',
      [imageId, BUCKET, key],
    )
    if (locked.rowCount !== 1) throw new Error('Image changed after commit; refusing rollback')
    const cancelled = await client.query(`
      UPDATE public.media_deletion_jobs
      SET status = 'cancelled', locked_at = NULL, locked_by = NULL, claim_token = NULL,
        last_error = 'Canonical migration delivery verification failed'
      WHERE id = $1 AND image_id = $2 AND reason = 'source_replaced'
        AND status = 'queued' AND delivery_verified_at IS NULL
      RETURNING id
    `, [jobId, imageId])
    if (cancelled.rowCount !== 1) throw new Error('Unverified source replacement job could not be cancelled')
    const image = snapshot.image
    await client.query(`
      UPDATE public.images SET
        width = $2, height = $3, storage_provider = $4,
        optimized_bucket = $5, optimized_key = $6, optimized_mime = $7,
        optimized_bytes = $8, optimized_width = $9, optimized_height = $10,
        storage_bucket = $11, storage_path = $12,
        original_bucket = $13, original_key = $14, original_mime_type = $15,
        original_bytes = $16, original_width = $17, original_height = $18,
        asset_version = $19, variants = $20, url = $21, visibility = $22,
        moderation_status = $23, moderation_provider = $24,
        moderation_labels = $25, moderation_error = $26, moderated_at = $27,
        processing_status = $28, checksum_sha256 = $29, status = $30,
        processed_at = $31, original_deletion_queued_at = $32,
        original_deleted_at = $33
      WHERE id = $1
    `, [imageId, image.width, image.height, image.storage_provider,
      image.optimized_bucket, image.optimized_key, image.optimized_mime,
      image.optimized_bytes, image.optimized_width, image.optimized_height,
      image.storage_bucket, image.storage_path, image.original_bucket, image.original_key,
      image.original_mime_type, image.original_bytes, image.original_width,
      image.original_height, image.asset_version, image.variants, image.url,
      image.visibility, image.moderation_status, image.moderation_provider,
      image.moderation_labels, image.moderation_error, image.moderated_at,
      image.processing_status, image.checksum_sha256, image.status, image.processed_at,
      image.original_deletion_queued_at, image.original_deleted_at])
    for (const draft of snapshot.drafts) {
      await client.query(`
        UPDATE public.submission_draft_images SET storage_bucket = $2, storage_path = $3,
          width = $4, height = $5, processing_status = $6, updated_at = $7 WHERE id = $1
      `, [draft.id, draft.storage_bucket, draft.storage_path, draft.width, draft.height,
        draft.processing_status, draft.updated_at])
    }
    for (const cragImage of snapshot.cragImages) {
      await client.query(
        'UPDATE public.crag_images SET url = $2, width = $3, height = $4 WHERE id = $1',
        [cragImage.id, cragImage.url, cragImage.width, cragImage.height],
      )
    }
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  }
}

async function markDeliveryVerified(client: Client, jobId: string, key: string): Promise<void> {
  await client.query('BEGIN')
  try {
    await client.query('SET LOCAL ROLE service_role')
    await client.query("SELECT set_config('request.jwt.claims', '{\"role\":\"service_role\"}', true)")
    await client.query('SELECT public.verify_media_replacement_delivery($1, $2)', [jobId, key])
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  }
}

async function migrateCandidate(
  client: Client,
  s3: S3Client,
  candidate: Candidate,
  cdnUrl: string,
  dryRun: boolean,
): Promise<ResultItem> {
  const image = await loadAndValidateImage(client, candidate, false)
  await validateHead(s3, image, candidate)
  if (dryRun) return { imageId: image.id, status: 'validated' }

  const source = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: candidate.sourceKey }))
  if (!source.Body) throw new Error('Original object body is missing')
  const sourceBytes = Buffer.from(await source.Body.transformToByteArray())
  if (sourceBytes.byteLength !== expectedSourceBytes(image)) throw new Error('Downloaded original object size has drifted')
  const output = await sharp(sourceBytes, { failOn: 'error' })
    .rotate()
    .resize({ width: 2560, height: 2560, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer({ resolveWithObject: true })
  const metadata = await sharp(output.data).metadata()
  if (metadata.format !== 'webp' || !metadata.width || !metadata.height || output.data.byteLength === 0) {
    throw new Error('Sharp produced invalid canonical WebP metadata')
  }
  const hash = createHash('sha256').update(output.data).digest('hex')
  const key = `images/assets/${image.id}/${hash}/canonical.webp`
  const canonicalUrl = buildVariantPath(key, 'detail')
  const manifest = buildManifest(key, metadata.width, metadata.height)
  await s3.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: output.data,
    ContentType: CANONICAL_MIME,
    CacheControl: CACHE_CONTROL,
  }))
  const canonicalHead = await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }))
  if (canonicalHead.ContentLength !== output.data.byteLength
    || normalizedContentType(canonicalHead.ContentType) !== CANONICAL_MIME) {
    throw new Error('Uploaded canonical WebP failed object verification')
  }
  await verifyPublicImage(`${cdnUrl}${canonicalUrl}`, true)

  const committed = await commitCanonical(client, candidate, {
    key,
    bytes: output.data.byteLength,
    width: metadata.width,
    height: metadata.height,
    manifest,
    url: canonicalUrl,
  })
  try {
    const urls = await currentDeliveryUrls(client, image.id, key, cdnUrl)
    for (const url of urls) await verifyPublicImage(url, false)
    await markDeliveryVerified(client, committed.jobId, key)
  } catch (verificationError) {
    try {
      await rollbackCommit(client, image.id, key, committed.jobId, committed.snapshot)
    } catch (rollbackError) {
      throw new Error(`Post-commit verification failed and atomic rollback failed: ${errorMessage(rollbackError)}`)
    }
    throw verificationError
  }
  return { imageId: image.id, status: 'migrated', canonicalKey: key, deletionJobId: committed.jobId }
}

async function main(): Promise<void> {
  const result: {
    schemaVersion: number
    generatedAt: string
    dryRun: boolean | null
    requested: number
    processed: number
    succeeded: number
    failed: number
    stoppedEarly: boolean
    results: ResultItem[]
    fatalError?: string
  } = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    dryRun: null,
    requested: 0,
    processed: 0,
    succeeded: 0,
    failed: 0,
    stoppedEarly: false,
    results: [],
  }
  let client: Client | null = null
  let s3: S3Client | null = null
  try {
    if (requiredEnv('CONFIRMATION') !== 'MIGRATE') throw new Error('CONFIRMATION must exactly equal MIGRATE')
    const dryRun = parseBoolean(requiredEnv('DRY_RUN'))
    result.dryRun = dryRun
    const batchSize = parseBatchSize(requiredEnv('BATCH_SIZE'))
    const requestedImageId = process.env.IMAGE_ID?.trim() || null
    if (requestedImageId && !UUID_PATTERN.test(requestedImageId)) throw new Error('IMAGE_ID must be a UUID')
    const reconciliation = JSON.parse(await readFile(requiredEnv('RECONCILIATION_INPUT'), 'utf8')) as unknown
    const category = parseCandidates(reconciliation)
    if (requestedImageId && !category.some((candidate) => candidate.imageId === requestedImageId)) {
      throw new Error('Requested image is not in liveReferencedUncanonicalized')
    }
    const candidates = (requestedImageId
      ? category.filter((candidate) => candidate.imageId === requestedImageId)
      : category).slice(0, batchSize)
    result.requested = candidates.length
    const credentials = await cloudflareCredentials()
    const accountId = requiredEnv('CLOUDFLARE_ACCOUNT_ID')
    if (!/^[0-9a-f]{32}$/i.test(accountId)) throw new Error('CLOUDFLARE_ACCOUNT_ID is invalid')
    const cdnUrl = requiredEnv('MEDIA_CDN_URL').replace(/\/$/, '')
    if (new URL(cdnUrl).protocol !== 'https:') throw new Error('MEDIA_CDN_URL must use HTTPS')
    s3 = new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials,
    })
    client = await createDatabaseClient()
    for (const candidate of candidates) {
      try {
        const item = await migrateCandidate(client, s3, candidate, cdnUrl, dryRun)
        result.results.push(item)
        result.succeeded += 1
      } catch (error) {
        result.results.push({ imageId: candidate.imageId, status: 'failed', error: errorMessage(error) })
        result.failed += 1
        result.stoppedEarly = true
        break
      } finally {
        result.processed += 1
      }
    }
    if (result.failed > 0) process.exitCode = 1
  } catch (error) {
    result.fatalError = errorMessage(error)
    result.failed += 1
    process.exitCode = 1
  } finally {
    await client?.end().catch(() => undefined)
    s3?.destroy()
    result.generatedAt = new Date().toISOString()
    await writeFile(RESULT_PATH, `${JSON.stringify(result, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
    console.log(JSON.stringify({
      dryRun: result.dryRun,
      requested: result.requested,
      processed: result.processed,
      succeeded: result.succeeded,
      failed: result.failed,
      stoppedEarly: result.stoppedEarly,
    }))
  }
}

void main()
