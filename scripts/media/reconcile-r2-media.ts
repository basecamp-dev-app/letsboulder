import { createHash } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

import { ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3'
import { Client, type QueryResultRow } from 'pg'

const BUCKET = 'lb-prod-media-private'
const OUTPUT_PATH = process.env.RECONCILIATION_OUTPUT?.trim() || 'media-reconciliation.json'

type Locator = { bucket: string | null; key: string | null }
type ImageRow = QueryResultRow & {
  id: string
  status: string
  processing_status: string
  visibility: string
  moderation_status: string
  crag_id: string | null
  crag_deleted_at: string | null
  storage_provider: string
  storage_bucket: string | null
  storage_path: string | null
  original_bucket: string | null
  original_key: string | null
  optimized_bucket: string | null
  optimized_key: string | null
  original_deleted_at: string | null
  original_deletion_queued_at: string | null
  url: string
  variants: unknown
}
type CragImageRow = QueryResultRow & {
  id: string
  crag_id: string
  linked_image_id: string | null
  source_image_id: string | null
  url: string
  crag_deleted_at: string | null
}
type DraftImageRow = QueryResultRow & {
  id: string
  draft_id: string
  linked_image_id: string | null
  linked_crag_image_id: string | null
  storage_provider: string
  storage_bucket: string
  storage_path: string
  original_bucket: string | null
  original_key: string | null
  processing_status: string
  draft_status: string
}
type RouteLineRow = QueryResultRow & { image_id: string }
type MediaJobRow = QueryResultRow & {
  image_id: string
  status: string
  source_provider: string | null
  source_bucket: string | null
  source_key: string | null
}
type DeletionJobRow = QueryResultRow & {
  image_id: string | null
  bucket: string
  object_key: string
  status: string
  reason: string
}
type R2Object = { key: string; size: number; lastModified: string | null; etag: string | null }
type Surface = { surface: string; recordId: string | null; imageId: string | null; status?: string }
type TextColumnRow = QueryResultRow & { table_name: string; column_name: string }

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Missing required environment variable: ${name}`)
  return value
}

function databaseConfig() {
  const port = Number.parseInt(requiredEnv('SUPABASE_DB_PORT'), 10)
  if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error('SUPABASE_DB_PORT is invalid')
  return {
    host: requiredEnv('SUPABASE_DB_HOST'),
    port,
    user: requiredEnv('SUPABASE_DB_USER'),
    database: requiredEnv('SUPABASE_DB_NAME'),
    password: requiredEnv('PGPASSWORD'),
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 30_000,
    query_timeout: 120_000,
  }
}

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`
}

function privateUrlLocator(value: string): Locator | null {
  const match = /^private:\/\/([^/]+)\/(.+)$/.exec(value)
  return match ? { bucket: match[1], key: match[2] } : null
}

function collectPrivateUrls(value: unknown, output: Locator[]): void {
  if (typeof value === 'string') {
    const locator = privateUrlLocator(value)
    if (locator) output.push(locator)
    return
  }
  if (Array.isArray(value)) {
    for (const item of value) collectPrivateUrls(item, output)
    return
  }
  if (value && typeof value === 'object') {
    for (const item of Object.values(value)) collectPrivateUrls(item, output)
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
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

async function listObjects(credentials: { accessKeyId: string; secretAccessKey: string }): Promise<R2Object[]> {
  const accountId = requiredEnv('CLOUDFLARE_ACCOUNT_ID')
  if (!/^[0-9a-f]{32}$/i.test(accountId)) throw new Error('CLOUDFLARE_ACCOUNT_ID is invalid')
  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials,
  })
  const objects: R2Object[] = []
  let continuationToken: string | undefined
  try {
    do {
      const page = await client.send(new ListObjectsV2Command({
        Bucket: BUCKET,
        ContinuationToken: continuationToken,
      }))
      for (const object of page.Contents ?? []) {
        if (!object.Key) continue
        objects.push({
          key: object.Key,
          size: object.Size ?? 0,
          lastModified: object.LastModified?.toISOString() ?? null,
          etag: object.ETag ?? null,
        })
      }
      if (page.IsTruncated && !page.NextContinuationToken) {
        throw new Error('R2 returned a truncated page without a continuation token')
      }
      continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined
    } while (continuationToken)
  } finally {
    client.destroy()
  }
  return objects
}

async function readDatabase(): Promise<{
  images: ImageRow[]
  cragImages: CragImageRow[]
  draftImages: DraftImageRow[]
  routeLines: RouteLineRow[]
  mediaJobs: MediaJobRow[]
  deletionJobs: DeletionJobRow[]
}> {
  const client = new Client(databaseConfig())
  await client.connect()
  try {
    await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY')
    const images = await client.query<ImageRow>(`
      SELECT i.id, i.status, i.processing_status, i.visibility, i.moderation_status,
        i.crag_id, c.deleted_at AS crag_deleted_at, i.storage_provider,
        storage_bucket, storage_path, original_bucket, original_key,
        optimized_bucket, optimized_key, original_deleted_at,
        original_deletion_queued_at, i.url, variants
      FROM public.images i
      LEFT JOIN public.crags c ON c.id = i.crag_id`)
    const cragImages = await client.query<CragImageRow>(`
      SELECT ci.id, ci.crag_id, ci.linked_image_id, ci.source_image_id, ci.url,
        c.deleted_at AS crag_deleted_at
      FROM public.crag_images ci
      JOIN public.crags c ON c.id = ci.crag_id`)
    const draftImages = await client.query<DraftImageRow>(`
      SELECT sdi.id, sdi.draft_id, sdi.linked_image_id, sdi.linked_crag_image_id,
        sdi.storage_provider, sdi.storage_bucket, sdi.storage_path,
        sdi.original_bucket, sdi.original_key, sdi.processing_status,
        sd.status AS draft_status
      FROM public.submission_draft_images sdi
      JOIN public.submission_drafts sd ON sd.id = sdi.draft_id`)
    const routeLines = await client.query<RouteLineRow>('SELECT image_id FROM public.route_lines')
    const mediaJobs = await client.query<MediaJobRow>(`
      SELECT image_id, status, payload->>'storageProvider' AS source_provider,
        payload->>'originalBucket' AS source_bucket,
        payload->>'originalKey' AS source_key
      FROM public.media_jobs`)
    const deletionJobs = await client.query<DeletionJobRow>(`
      SELECT image_id, bucket, object_key, status, reason
      FROM public.media_deletion_jobs`)
    await client.query('COMMIT')
    return {
      images: images.rows,
      cragImages: cragImages.rows,
      draftImages: draftImages.rows,
      routeLines: routeLines.rows,
      mediaJobs: mediaJobs.rows,
      deletionJobs: deletionJobs.rows,
    }
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally {
    await client.end()
  }
}

async function scanPublicTextReferences(keys: string[]): Promise<Map<string, string[]>> {
  const references = new Map<string, string[]>()
  if (keys.length === 0) return references

  const client = new Client(databaseConfig())
  await client.connect()
  try {
    await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY')
    const columns = await client.query<TextColumnRow>(`
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND data_type IN ('text', 'character varying', 'json', 'jsonb')
      ORDER BY table_name, ordinal_position`)

    for (const column of columns.rows) {
      const table = quoteIdentifier(column.table_name)
      const field = quoteIdentifier(column.column_name)
      const matches = await client.query<{ key: string }>(`
        SELECT candidate.key
        FROM unnest($1::text[]) AS candidate(key)
        WHERE EXISTS (
          SELECT 1 FROM public.${table} AS source_row
          WHERE source_row.${field}::text LIKE '%' || candidate.key || '%'
        )
      `, [keys])
      for (const match of matches.rows) {
        const matchedSurfaces = references.get(match.key) ?? []
        matchedSurfaces.push(`${column.table_name}.${column.column_name}`)
        references.set(match.key, matchedSurfaces)
      }
    }
    await client.query('COMMIT')
    return references
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally {
    await client.end()
  }
}

function addSurface(
  surfaces: Map<string, Surface[]>,
  locator: Locator,
  surface: Surface,
): void {
  if (locator.bucket !== BUCKET || !locator.key) return
  const entries = surfaces.get(locator.key) ?? []
  entries.push(surface)
  surfaces.set(locator.key, entries)
}

export function isActiveIngestStatus(status: string): boolean {
  return status === 'queued' || status === 'processing'
}

export function shouldReportMissingSource(input: {
  live: boolean
  sourceCount: number
  existingSourceCount: number
  originalDeleted: boolean
  sourceDeletionTracked: boolean
}): boolean {
  return input.live
    && input.sourceCount > 0
    && input.existingSourceCount === 0
    && !input.originalDeleted
    && !input.sourceDeletionTracked
}

async function main(): Promise<void> {
  const credentials = await cloudflareCredentials()
  const [objects, database] = await Promise.all([listObjects(credentials), readDatabase()])
  const objectKeys = new Set(objects.map((object) => object.key))
  const objectByKey = new Map(objects.map((object) => [object.key, object]))
  const imageIds = new Set(database.images.map((image) => image.id))
  const surfaces = new Map<string, Surface[]>()
  const expectedObjectKeys = new Set<string>()
  const imageSources = new Map<string, Set<string>>()
  const liveReferences = new Set(database.images
    .filter((image) => image.processing_status === 'ready'
      && (image.moderation_status === 'approved' || image.moderation_status === 'skipped')
      && image.visibility === 'public'
      && image.status === 'approved'
      && !image.crag_deleted_at)
    .map((image) => image.id))
  for (const cragImage of database.cragImages) {
    const imageId = cragImage.linked_image_id ?? cragImage.source_image_id
    if (!cragImage.crag_deleted_at && imageId) liveReferences.add(imageId)
  }
  for (const draftImage of database.draftImages) {
    if (draftImage.draft_status === 'draft' && draftImage.linked_image_id) {
      liveReferences.add(draftImage.linked_image_id)
    }
  }
  for (const routeLine of database.routeLines) liveReferences.add(routeLine.image_id)
  const sourceDeletionKeys = new Set(database.deletionJobs
    .filter((job) => job.bucket === BUCKET && job.reason === 'source_replaced' && job.status !== 'cancelled')
    .map((job) => job.object_key))

  const addImageSource = (imageId: string, locator: Locator, surface: Surface): void => {
    addSurface(surfaces, locator, surface)
    if (locator.bucket !== BUCKET || !locator.key) return
    const keys = imageSources.get(imageId) ?? new Set<string>()
    keys.add(locator.key)
    imageSources.set(imageId, keys)
  }

  for (const image of database.images) {
    const live = image.status !== 'deleted' && liveReferences.has(image.id)
    const originalLocator = { bucket: image.original_bucket, key: image.original_key }
    const storageLocator = { bucket: image.storage_bucket, key: image.storage_path }
    addImageSource(image.id, originalLocator, {
      surface: 'images.original', recordId: image.id, imageId: image.id,
    })
    addSurface(surfaces, storageLocator, {
      surface: 'images.storage', recordId: image.id, imageId: image.id,
    })
    if (image.storage_bucket !== image.optimized_bucket || image.storage_path !== image.optimized_key) {
      if (storageLocator.bucket === BUCKET && storageLocator.key) {
        const keys = imageSources.get(image.id) ?? new Set<string>()
        keys.add(storageLocator.key)
        imageSources.set(image.id, keys)
      }
    }
    addSurface(surfaces, { bucket: image.optimized_bucket, key: image.optimized_key }, {
      surface: 'images.optimized', recordId: image.id, imageId: image.id,
    })
    if (live && !image.original_deleted_at && originalLocator.bucket === BUCKET && originalLocator.key
      && !sourceDeletionKeys.has(originalLocator.key)) {
      expectedObjectKeys.add(originalLocator.key)
    }
    if (live && storageLocator.bucket === BUCKET && storageLocator.key) expectedObjectKeys.add(storageLocator.key)
    if (live && image.optimized_bucket === BUCKET && image.optimized_key) expectedObjectKeys.add(image.optimized_key)
    const embedded: Locator[] = []
    const urlLocator = privateUrlLocator(image.url)
    if (urlLocator) embedded.push(urlLocator)
    collectPrivateUrls(image.variants, embedded)
    for (const locator of embedded) {
      addSurface(surfaces, locator, {
        surface: 'images.urlOrVariant', recordId: image.id, imageId: image.id,
      })
      if (live && locator.bucket === BUCKET && locator.key) expectedObjectKeys.add(locator.key)
    }
  }
  for (const cragImage of database.cragImages) {
    const imageId = cragImage.linked_image_id ?? cragImage.source_image_id
    const locator = privateUrlLocator(cragImage.url)
    if (locator) addSurface(surfaces, locator, {
      surface: 'crag_images.url', recordId: cragImage.id, imageId,
    })
    if (!cragImage.crag_deleted_at && locator?.bucket === BUCKET && locator.key) {
      expectedObjectKeys.add(locator.key)
    }
  }
  for (const draftImage of database.draftImages) {
    const imageId = draftImage.linked_image_id
    addSurface(surfaces, { bucket: draftImage.storage_bucket, key: draftImage.storage_path }, {
      surface: 'submission_draft_images.storage', recordId: draftImage.id, imageId,
    })
    addSurface(surfaces, { bucket: draftImage.original_bucket, key: draftImage.original_key }, {
      surface: 'submission_draft_images.original', recordId: draftImage.id, imageId,
    })
    if (draftImage.draft_status === 'draft' && draftImage.storage_bucket === BUCKET) {
      expectedObjectKeys.add(draftImage.storage_path)
    }
  }
  for (const job of database.mediaJobs) {
    const locator = { bucket: job.source_bucket, key: job.source_key }
    if (isActiveIngestStatus(job.status)) {
      addImageSource(job.image_id, locator, {
        surface: 'media_jobs.source', recordId: null, imageId: job.image_id, status: job.status,
      })
      if (job.source_bucket === BUCKET && job.source_key) expectedObjectKeys.add(job.source_key)
    } else {
      addSurface(surfaces, locator, {
        surface: 'media_jobs.source', recordId: null, imageId: job.image_id, status: job.status,
      })
    }
  }
  for (const job of database.deletionJobs) {
    addSurface(surfaces, { bucket: job.bucket, key: job.object_key }, {
      surface: 'media_deletion_jobs.object', recordId: null, imageId: job.image_id, status: job.status,
    })
  }

  const imageClassifications = {
    liveReferencedUncanonicalized: [] as Array<Record<string, unknown>>,
    alreadyCanonicalWithOriginalPresent: [] as Array<Record<string, unknown>>,
    missingSource: [] as Array<Record<string, unknown>>,
    ambiguous: [] as Array<Record<string, unknown>>,
  }
  for (const image of database.images) {
    const sources = [...(imageSources.get(image.id) ?? [])]
    const existingSources = sources.filter((key) => objectKeys.has(key))
    const canonicalTracked = image.optimized_bucket === BUCKET && Boolean(image.optimized_key)
    const canonicalPresent = canonicalTracked && objectKeys.has(image.optimized_key as string)
    const live = image.status !== 'deleted' && liveReferences.has(image.id)
    const base = {
      imageId: image.id,
      imageStatus: image.status,
      processingStatus: image.processing_status,
      sourceKeys: sources,
      sourceBytes: existingSources.reduce((total, key) => total + (objectByKey.get(key)?.size ?? 0), 0),
      canonicalKey: image.optimized_bucket === BUCKET ? image.optimized_key : null,
    }
    if (live && sources.length > 1) {
      imageClassifications.ambiguous.push({ ...base, reason: 'multipleSourceLocators' })
    } else if (canonicalPresent && existingSources.length > 0) {
      imageClassifications.alreadyCanonicalWithOriginalPresent.push(base)
    } else if (live && !canonicalTracked && existingSources.length > 0) {
      imageClassifications.liveReferencedUncanonicalized.push(base)
    } else if (shouldReportMissingSource({
      live,
      sourceCount: sources.length,
      existingSourceCount: existingSources.length,
      originalDeleted: Boolean(image.original_deleted_at),
      sourceDeletionTracked: sources.some((key) => sourceDeletionKeys.has(key)),
    })) {
      imageClassifications.missingSource.push(base)
    }
  }

  const unreferencedObjects = objects.filter((object) => !surfaces.has(object.key))
  const textReferences = await scanPublicTextReferences(unreferencedObjects.map((object) => object.key))
  const objectClassifications = {
    referenced: [] as Array<Record<string, unknown>>,
    deletionTracked: [] as Array<Record<string, unknown>>,
    possibleOrphan: [] as Array<Record<string, unknown>>,
  }
  for (const object of objects) {
    const objectSurfaces = surfaces.get(object.key) ?? []
    const historicalSurfaces = textReferences.get(object.key) ?? []
    const namespaceMatch = /^images\/(?:assets|originals|staging)\/([0-9a-f-]{36})\//i.exec(object.key)
    const item = {
      ...object,
      surfaces: objectSurfaces,
      historicalSurfaces,
      namespaceImageId: namespaceMatch?.[1] ?? null,
      namespaceImageExists: namespaceMatch ? imageIds.has(namespaceMatch[1]) : null,
    }
    if (objectSurfaces.length === 0 && historicalSurfaces.length === 0) {
      objectClassifications.possibleOrphan.push(item)
    } else if (objectSurfaces.some((surface) => surface.surface === 'media_deletion_jobs.object')) {
      objectClassifications.deletionTracked.push(item)
    } else {
      objectClassifications.referenced.push(item)
    }
  }

  const missingDatabaseObjects = [...expectedObjectKeys]
    .filter((key) => !objectKeys.has(key))
    .map((key) => ({ bucket: BUCKET, key, surfaces: surfaces.get(key) ?? [] }))
  const danglingImageReferences = [
    ...database.cragImages.flatMap((row) => [row.linked_image_id, row.source_image_id]),
    ...database.draftImages.map((row) => row.linked_image_id),
    ...database.routeLines.map((row) => row.image_id),
    ...database.mediaJobs.map((row) => row.image_id),
  ].filter((id): id is string => typeof id === 'string' && !imageIds.has(id))

  const summary = {
    database: {
      images: database.images.length,
      cragImages: database.cragImages.length,
      draftImages: database.draftImages.length,
      routeLines: database.routeLines.length,
      mediaJobs: database.mediaJobs.length,
      mediaDeletionJobs: database.deletionJobs.length,
    },
    r2: { objects: objects.length, bytes: objects.reduce((total, object) => total + object.size, 0) },
    candidates: {
      liveReferencedUncanonicalized: imageClassifications.liveReferencedUncanonicalized.length,
      alreadyCanonicalWithOriginalPresent: imageClassifications.alreadyCanonicalWithOriginalPresent.length,
      missingSource: imageClassifications.missingSource.length,
      ambiguous: imageClassifications.ambiguous.length,
      possibleOrphan: objectClassifications.possibleOrphan.length,
    },
    anomalies: {
      missingDatabaseObjects: missingDatabaseObjects.length,
      danglingImageReferences: new Set(danglingImageReferences).size,
    },
  }
  const artifact = {
    schemaVersion: 2,
    generatedAt: new Date().toISOString(),
    summary,
    imageClassifications,
    objectClassifications,
    anomalies: {
      missingDatabaseObjects,
      danglingImageReferences: [...new Set(danglingImageReferences)],
    },
  }
  await writeFile(OUTPUT_PATH, `${JSON.stringify(artifact, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
  console.log(JSON.stringify(summary))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'Unknown reconciliation error'
    console.error(`Media reconciliation failed: ${message}`)
    process.exitCode = 1
  })
}
