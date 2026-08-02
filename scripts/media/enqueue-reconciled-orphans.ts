import { createHash } from 'node:crypto'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

import { HeadObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { Client, type QueryResultRow } from 'pg'

const BUCKET = 'lb-prod-media-private'
const MAX_CANDIDATES = 25
const UUID_PATTERN = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const ORIGINAL_KEY_PATTERN = new RegExp(`^images/originals/(${UUID_PATTERN})/[^/]+$`, 'i')

export type OrphanCandidate = {
  key: string
  size: number
  lastModified: string
  etag: string
  namespaceImageId: string
}

type QuarantineEntry = {
  objectKey?: string
  bytes?: number
  reason: string
  jobId?: string
  error?: string
}
type JobEntry = {
  objectKey: string
  bytes: number
  jobId?: string
  status: string
  attempts?: number
  error?: string
}
type JobRow = QueryResultRow & {
  id: string
  object_key: string
  status: string
  attempts: number
  last_error: string | null
}
type RpcRow = QueryResultRow & { object_key: string; job_id: string }
type TextColumnRow = QueryResultRow & { table_name: string; column_name: string }

type Provenance = {
  sourceRunId: string
  artifactDigest: string
  executionRunId: string
  candidateCount: number
  candidateBytes: number
  selectedCount: number
  selectedBytes: number
  dryRun: boolean | null
  generatedAt: string
  fatalError?: string
}

type Manifests = {
  attempted: JobEntry[]
  queued: JobEntry[]
  skipped: QuarantineEntry[]
  failed: Array<JobEntry | QuarantineEntry>
  completed: JobEntry[]
  retainedQuarantine: QuarantineEntry[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Missing required environment variable: ${name}`)
  return value
}

function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : 'Unknown orphan enqueue error'
  return message.replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 2_000)
}

function parseBoolean(value: string): boolean {
  if (value === 'true') return true
  if (value === 'false') return false
  throw new Error('DRY_RUN must be true or false')
}

function parseBatchSize(value: string): number {
  const size = Number(value)
  if (!Number.isInteger(size) || size < 1 || size > MAX_CANDIDATES) {
    throw new Error(`BATCH_SIZE must be an integer between 1 and ${MAX_CANDIDATES}`)
  }
  return size
}

function normalizeEtag(value: string): string {
  return value.trim().replace(/^"|"$/g, '')
}

export function classifyOrphanCandidates(input: unknown): {
  candidates: OrphanCandidate[]
  retained: QuarantineEntry[]
  sourceCount: number
  sourceBytes: number
} {
  if (!isRecord(input) || input.schemaVersion !== 2 || !isRecord(input.objectClassifications)
    || !Array.isArray(input.objectClassifications.possibleOrphan)) {
    throw new Error('Reconciliation input must use schemaVersion 2 with possibleOrphan candidates')
  }

  const category = input.objectClassifications.possibleOrphan
  const candidates: OrphanCandidate[] = []
  const retained: QuarantineEntry[] = []
  const seen = new Set<string>()
  let sourceBytes = 0

  for (const item of category) {
    const key = isRecord(item) && typeof item.key === 'string' ? item.key : undefined
    const size = isRecord(item) && typeof item.size === 'number' && Number.isSafeInteger(item.size) && item.size >= 0
      ? item.size
      : undefined
    if (size !== undefined) sourceBytes += size
    const base = { objectKey: key, bytes: size }
    if (!isRecord(item)) {
      retained.push({ reason: 'invalid-candidate-record' })
      continue
    }
    const namespace = key ? ORIGINAL_KEY_PATTERN.exec(key) : null
    const eligible = key && size !== undefined && size > 0
      && typeof item.lastModified === 'string' && !Number.isNaN(Date.parse(item.lastModified))
      && typeof item.etag === 'string' && normalizeEtag(item.etag).length > 0
      && Array.isArray(item.surfaces) && item.surfaces.length === 0
      && Array.isArray(item.historicalSurfaces) && item.historicalSurfaces.length === 0
      && item.namespaceImageExists === false
      && typeof item.namespaceImageId === 'string' && namespace
      && item.namespaceImageId.toLowerCase() === namespace[1].toLowerCase()
    if (!eligible || !key || size === undefined || !namespace) {
      retained.push({ ...base, reason: 'noneligible-artifact-candidate' })
      continue
    }
    if (seen.has(key)) throw new Error(`Reconciliation input contains duplicate object key: ${key}`)
    seen.add(key)
    candidates.push({
      key,
      size,
      lastModified: item.lastModified as string,
      etag: normalizeEtag(item.etag as string),
      namespaceImageId: namespace[1].toLowerCase(),
    })
  }
  candidates.sort((left, right) => left.key.localeCompare(right.key, 'en'))
  return { candidates, retained, sourceCount: category.length, sourceBytes }
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

async function validateObjectMetadata(s3: S3Client, candidate: OrphanCandidate): Promise<string | null> {
  try {
    const head = await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: candidate.key }))
    const etag = head.ETag ? normalizeEtag(head.ETag) : null
    const reviewedModifiedSecond = Math.floor(new Date(candidate.lastModified).getTime() / 1_000)
    const currentModifiedSecond = head.LastModified ? Math.floor(head.LastModified.getTime() / 1_000) : null
    if (head.ContentLength !== candidate.size || currentModifiedSecond !== reviewedModifiedSecond
      || etag !== candidate.etag) {
      return 'object-metadata-drift'
    }
    return null
  } catch (error) {
    return `object-head-failed: ${errorMessage(error)}`
  }
}

async function beginServiceTransaction(client: Client, readOnly = false): Promise<void> {
  await client.query(`BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ${readOnly ? ' READ ONLY' : ''}`)
  await client.query('SET LOCAL ROLE service_role')
  await client.query("SELECT set_config('request.jwt.claims', '{\"role\":\"service_role\"}', true)")
}

async function findCurrentReferences(client: Client, candidates: OrphanCandidate[]): Promise<Map<string, string[]>> {
  const references = new Map<string, string[]>()
  const keys = candidates.map((candidate) => candidate.key)
  const ids = candidates.map((candidate) => candidate.namespaceImageId)
  const existingImages = await client.query<{ id: string }>(
    'SELECT id::text AS id FROM public.images WHERE id = ANY($1::uuid[])', [ids],
  )
  for (const row of existingImages.rows) {
    const candidate = candidates.find((item) => item.namespaceImageId === row.id.toLowerCase())
    if (candidate) references.set(candidate.key, ['images.id'])
  }

  const columns = await client.query<TextColumnRow>(`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name <> 'media_deletion_jobs'
      AND data_type IN ('text', 'character varying', 'json', 'jsonb', 'ARRAY')
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
      const surfaces = references.get(match.key) ?? []
      surfaces.push(`${column.table_name}.${column.column_name}`)
      references.set(match.key, surfaces)
    }
  }
  return references
}

async function enqueueCandidates(
  client: Client,
  candidates: OrphanCandidate[],
  reconciliationRunId: string,
  artifactDigest: string,
): Promise<RpcRow[]> {
  await beginServiceTransaction(client)
  try {
    const references = await findCurrentReferences(client, candidates)
    if (references.size > 0) {
      const details = [...references].map(([key, surfaces]) => `${key}: ${surfaces.join(',')}`).join('; ')
      throw new Error(`Current database references found: ${details}`)
    }
    const result = await client.query<RpcRow>(`
      SELECT object_key, job_id::text
      FROM public.enqueue_reconciled_media_orphans(
        $1::text, $2::text[], $3::text[], $4::bigint[], $5::bigint, $6::text
      )
    `, [
      BUCKET,
      candidates.map((candidate) => candidate.key),
      candidates.map((candidate) => candidate.etag),
      candidates.map((candidate) => candidate.size),
      reconciliationRunId,
      artifactDigest,
    ])
    const expected = new Set(candidates.map((candidate) => candidate.key))
    if (result.rows.length !== candidates.length || result.rows.some((row) => {
      if (!expected.delete(row.object_key)) return true
      return !new RegExp(`^${UUID_PATTERN}$`, 'i').test(row.job_id)
    }) || expected.size !== 0) {
      throw new Error('Enqueue RPC returned an inconsistent key/job mapping')
    }
    await client.query('COMMIT')
    return result.rows
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  }
}

async function readJobs(client: Client, jobIds: string[]): Promise<JobRow[]> {
  await beginServiceTransaction(client, true)
  try {
    const result = await client.query<JobRow>(`
      SELECT id::text, object_key, status, attempts, last_error
      FROM public.media_deletion_jobs
      WHERE bucket = $1 AND id = ANY($2::uuid[])
      ORDER BY object_key
    `, [BUCKET, jobIds])
    if (result.rows.length !== jobIds.length) throw new Error('One or more enqueued durable jobs disappeared')
    await client.query('COMMIT')
    return result.rows
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  }
}

async function pollJobs(client: Client, jobIds: string[]): Promise<{ rows: JobRow[]; timedOut: boolean }> {
  const timeoutSeconds = Number.parseInt(process.env.POLL_TIMEOUT_SECONDS?.trim() || '600', 10)
  const intervalSeconds = Number.parseInt(process.env.POLL_INTERVAL_SECONDS?.trim() || '10', 10)
  if (!Number.isInteger(timeoutSeconds) || timeoutSeconds < 0 || timeoutSeconds > 3600
    || !Number.isInteger(intervalSeconds) || intervalSeconds < 1 || intervalSeconds > 60) {
    throw new Error('Polling configuration is invalid')
  }
  const deadline = Date.now() + timeoutSeconds * 1_000
  let rows = await readJobs(client, jobIds)
  while (rows.some((row) => row.status === 'queued' || row.status === 'processing') && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, intervalSeconds * 1_000))
    rows = await readJobs(client, jobIds)
  }
  return { rows, timedOut: rows.some((row) => row.status === 'queued' || row.status === 'processing') }
}

async function writeManifests(directory: string, provenance: Provenance, manifests: Manifests): Promise<void> {
  await mkdir(directory, { recursive: true, mode: 0o700 })
  const files: Array<[string, Array<JobEntry | QuarantineEntry>]> = [
    ['attempted', manifests.attempted],
    ['queued', manifests.queued],
    ['skipped', manifests.skipped],
    ['failed', manifests.failed],
    ['completed', manifests.completed],
    ['retained-quarantine', manifests.retainedQuarantine],
  ]
  await Promise.all(files.map(([name, entries]) => writeFile(
    `${directory}/${name}.json`,
    `${JSON.stringify({ schemaVersion: 1, ...provenance, manifest: name, entries }, null, 2)}\n`,
    { encoding: 'utf8', mode: 0o600 },
  )))
}

async function main(): Promise<void> {
  const provenance: Provenance = {
    sourceRunId: process.env.SOURCE_RUN_ID?.trim() || 'unknown',
    artifactDigest: process.env.ARTIFACT_DIGEST?.trim() || 'unknown',
    executionRunId: process.env.EXECUTION_RUN_ID?.trim() || 'unknown',
    candidateCount: 0,
    candidateBytes: 0,
    selectedCount: 0,
    selectedBytes: 0,
    dryRun: null,
    generatedAt: new Date().toISOString(),
  }
  const manifests: Manifests = {
    attempted: [], queued: [], skipped: [], failed: [], completed: [], retainedQuarantine: [],
  }
  const resultDirectory = process.env.ORPHAN_MANIFEST_DIR?.trim() || 'media-orphan-enqueue-manifests'
  let client: Client | null = null
  let s3: S3Client | null = null
  let selectedCandidates: OrphanCandidate[] = []
  try {
    if (requiredEnv('CONFIRMATION') !== 'ENQUEUE_ORPHANS') {
      throw new Error('CONFIRMATION must exactly equal ENQUEUE_ORPHANS')
    }
    const sourceRunId = requiredEnv('SOURCE_RUN_ID')
    if (!/^\d+$/.test(sourceRunId)) throw new Error('SOURCE_RUN_ID must be a GitHub run ID')
    const digest = requiredEnv('ARTIFACT_DIGEST')
    if (!/^sha256:[0-9a-f]{64}$/.test(digest)) throw new Error('ARTIFACT_DIGEST must be a lowercase sha256 digest')
    requiredEnv('EXECUTION_RUN_ID')
    const dryRun = parseBoolean(requiredEnv('DRY_RUN'))
    provenance.dryRun = dryRun
    const batchSize = parseBatchSize(requiredEnv('BATCH_SIZE'))
    const artifact = JSON.parse(await readFile(requiredEnv('RECONCILIATION_INPUT'), 'utf8')) as unknown
    const parsed = classifyOrphanCandidates(artifact)
    provenance.candidateCount = parsed.sourceCount
    provenance.candidateBytes = parsed.sourceBytes
    manifests.skipped.push(...parsed.retained)
    manifests.retainedQuarantine.push(...parsed.retained)
    const selected = parsed.candidates.slice(0, batchSize)
    selectedCandidates = selected
    for (const candidate of parsed.candidates.slice(batchSize)) {
      const entry = { objectKey: candidate.key, bytes: candidate.size, reason: 'deterministic-batch-limit' }
      manifests.skipped.push(entry)
      manifests.retainedQuarantine.push(entry)
    }
    provenance.selectedCount = selected.length
    provenance.selectedBytes = selected.reduce((total, candidate) => total + candidate.size, 0)
    manifests.attempted.push(...selected.map((candidate) => ({
      objectKey: candidate.key, bytes: candidate.size, status: 'revalidating',
    })))
    if (selected.length === 0) return

    const credentials = await cloudflareCredentials()
    const accountId = requiredEnv('CLOUDFLARE_ACCOUNT_ID')
    if (!/^[0-9a-f]{32}$/i.test(accountId)) throw new Error('CLOUDFLARE_ACCOUNT_ID is invalid')
    s3 = new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials,
    })
    const metadataResults = await Promise.all(selected.map(async (candidate) => ({
      candidate,
      inconsistency: await validateObjectMetadata(s3 as S3Client, candidate),
    })))
    const drifted = metadataResults.filter((result) => result.inconsistency)
    if (drifted.length > 0) {
      for (const result of metadataResults) {
        const reason = result.inconsistency || 'batch-stopped-on-peer-inconsistency'
        const entry = { objectKey: result.candidate.key, bytes: result.candidate.size, reason }
        manifests.skipped.push(entry)
        manifests.retainedQuarantine.push(entry)
      }
      throw new Error('Selected batch failed current object metadata revalidation; nothing was enqueued')
    }

    client = new Client(databaseConfig())
    await client.connect()
    if (dryRun) {
      await beginServiceTransaction(client, true)
      try {
        const references = await findCurrentReferences(client, selected)
        if (references.size > 0) throw new Error('Selected batch has current database references')
        await client.query('COMMIT')
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined)
        throw error
      }
      for (const candidate of selected) {
        const entry = { objectKey: candidate.key, bytes: candidate.size, reason: 'dry-run-retained' }
        manifests.skipped.push(entry)
        manifests.retainedQuarantine.push(entry)
      }
      return
    }

    let rpcRows: RpcRow[]
    try {
      rpcRows = await enqueueCandidates(client, selected, sourceRunId, digest)
    } catch (error) {
      const reason = `enqueue-stopped: ${errorMessage(error)}`
      for (const candidate of selected) {
        const entry = { objectKey: candidate.key, bytes: candidate.size, reason }
        manifests.skipped.push(entry)
        manifests.retainedQuarantine.push(entry)
      }
      throw error
    }
    const candidateByKey = new Map(selected.map((candidate) => [candidate.key, candidate]))
    manifests.queued.push(...rpcRows.map((row) => ({
      objectKey: row.object_key,
      bytes: candidateByKey.get(row.object_key)?.size ?? 0,
      jobId: row.job_id,
      status: 'queued',
    })))
    const pollResult = await pollJobs(client, rpcRows.map((row) => row.job_id))
    const jobs = pollResult.rows
    for (const job of jobs) {
      const entry: JobEntry = {
        objectKey: job.object_key,
        bytes: candidateByKey.get(job.object_key)?.size ?? 0,
        jobId: job.id,
        status: job.status,
        attempts: job.attempts,
        ...(job.last_error ? { error: job.last_error } : {}),
      }
      if (job.status === 'completed') manifests.completed.push(entry)
      else if (job.status === 'failed' || job.status === 'cancelled') {
        manifests.failed.push(entry)
        manifests.retainedQuarantine.push({
          objectKey: job.object_key,
          bytes: entry.bytes,
          jobId: job.id,
          reason: `durable-job-${job.status}`,
          ...(job.last_error ? { error: job.last_error } : {}),
        })
      } else {
        const queued = manifests.queued.find((item) => item.jobId === job.id)
        if (!queued) throw new Error('Polled job was not present in the queued manifest')
        Object.assign(queued, entry)
      }
    }
    if (pollResult.timedOut) throw new Error('Durable orphan jobs did not complete before the polling deadline')
    if (manifests.failed.length > 0) process.exitCode = 1
  } catch (error) {
    provenance.fatalError = errorMessage(error)
    if (manifests.queued.length === 0 && manifests.completed.length === 0) {
      const retainedKeys = new Set(manifests.retainedQuarantine.map((entry) => entry.objectKey))
      for (const candidate of selectedCandidates) {
        if (retainedKeys.has(candidate.key)) continue
        const entry = {
          objectKey: candidate.key,
          bytes: candidate.size,
          reason: 'execution-stopped-before-enqueue',
          error: provenance.fatalError,
        }
        manifests.skipped.push(entry)
        manifests.retainedQuarantine.push(entry)
      }
    }
    manifests.failed.push({ reason: 'execution-failed', error: provenance.fatalError })
    process.exitCode = 1
  } finally {
    await client?.end().catch(() => undefined)
    s3?.destroy()
    provenance.generatedAt = new Date().toISOString()
    await writeManifests(resultDirectory, provenance, manifests)
    console.log(JSON.stringify({
      candidateCount: provenance.candidateCount,
      candidateBytes: provenance.candidateBytes,
      selectedCount: provenance.selectedCount,
      dryRun: provenance.dryRun,
      queued: manifests.queued.length,
      completed: manifests.completed.length,
      failed: manifests.failed.length,
      retainedQuarantine: manifests.retainedQuarantine.length,
    }))
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) void main()
