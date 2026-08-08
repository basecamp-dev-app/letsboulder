import { readFile, writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

import { Client, type QueryResultRow } from 'pg'

const OUTPUT_PATH = process.env.LIFECYCLE_HEALTH_OUTPUT?.trim() || 'production-media-lifecycle-health.json'
const RECONCILIATION_PATH = process.env.RECONCILIATION_INPUT?.trim() || null
const WARNING_SECONDS = 30 * 60
const CRITICAL_SECONDS = 6 * 60 * 60
const REPORTED_CATEGORIES = [
  'ingest_queued', 'ingest_processing', 'ingest_failed',
  'deletion_queued', 'deletion_processing', 'deletion_failed',
  'source_replacement_awaiting_verification', 'job_lock_invariant',
  'canonical_locator_invariant', 'source_replacement_invariant',
  'missing_database_object', 'dangling_image_reference', 'missing_source',
  'ambiguous_source', 'possible_r2_orphan', 'stale_staging_object',
] as const

export type Severity = 'info' | 'warning' | 'critical'
type Finding = {
  category: string
  severity: Severity
  id: string
  ageSeconds: number | null
  snapshot: Record<string, unknown>
  detail?: string
}
type JobRow = QueryResultRow & {
  kind: 'ingest_job' | 'deletion_job'
  id: string
  status: string
  updated_at: string
  created_at: string
  run_at: string
  locked_at: string | null
  locked_by: string | null
  attempts: number
  max_attempts: number
  image_id: string | null
  reason: string | null
  bucket: string | null
  object_key: string | null
  delivery_verified_at: string | null
}
type InvariantRow = QueryResultRow & { category: string; id: string; detail: string }

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Missing required environment variable: ${name}`)
  return value
}

function databaseConfig() {
  const port = Number.parseInt(requiredEnv('SUPABASE_DB_PORT'), 10)
  if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error('SUPABASE_DB_PORT is invalid')
  return {
    host: requiredEnv('SUPABASE_DB_HOST'), port, user: requiredEnv('SUPABASE_DB_USER'),
    database: requiredEnv('SUPABASE_DB_NAME'), password: requiredEnv('PGPASSWORD'),
    ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 30_000, query_timeout: 120_000,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function errorMessage(error: unknown): string {
  return (error instanceof Error ? error.message : 'Unknown lifecycle health error')
    .replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 2_000)
}

export function classifyLifecycleAge(ageSeconds: number, terminalOrInvariant = false): Severity {
  if (!Number.isFinite(ageSeconds) || ageSeconds < 0) throw new Error('Lifecycle age must be a non-negative number')
  if (terminalOrInvariant || ageSeconds > CRITICAL_SECONDS) return 'critical'
  if (ageSeconds > WARNING_SECONDS) return 'warning'
  return 'info'
}

function ageInSeconds(asOf: Date, timestamp: string): number {
  const value = new Date(timestamp).getTime()
  if (!Number.isFinite(value)) throw new Error(`Database returned an invalid timestamp: ${timestamp}`)
  return Math.max(0, Math.floor((asOf.getTime() - value) / 1_000))
}

async function readLifecycle(): Promise<{ asOf: Date; jobs: JobRow[]; invariants: InvariantRow[] }> {
  const client = new Client(databaseConfig())
  await client.connect()
  try {
    await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY')
    const clock = await client.query<{ as_of: string }>('SELECT transaction_timestamp()::text AS as_of')
    const jobs = await client.query<JobRow>(`
      SELECT 'ingest_job'::text AS kind, id::text, status, updated_at::text, created_at::text,
        run_at::text, locked_at::text, locked_by, attempts, max_attempts, image_id::text,
        NULL::text AS reason, NULL::text AS bucket, NULL::text AS object_key,
        NULL::text AS delivery_verified_at
      FROM public.media_jobs
      WHERE status IN ('queued', 'processing', 'failed')
      UNION ALL
      SELECT 'deletion_job'::text, id::text, status, updated_at::text, created_at::text,
        run_at::text, locked_at::text, locked_by, attempts, max_attempts, image_id::text,
        reason, bucket, object_key, delivery_verified_at::text
      FROM public.media_deletion_jobs
      WHERE status IN ('queued', 'processing', 'failed')
      ORDER BY kind, id`)
    const invariants = await client.query<InvariantRow>(`
      SELECT 'job_lock_invariant' AS category, id::text,
        'Ingest job lock fields disagree with status' AS detail
      FROM public.media_jobs
      WHERE (status = 'processing') IS DISTINCT FROM (locked_at IS NOT NULL AND locked_by IS NOT NULL)
      UNION ALL
      SELECT 'canonical_locator_invariant', id::text,
        'Canonical image storage locator or source-deletion marker is inconsistent'
      FROM public.images
      WHERE optimized_bucket IS NOT NULL AND (
        storage_bucket IS DISTINCT FROM optimized_bucket
        OR storage_path IS DISTINCT FROM optimized_key
        OR original_deletion_queued_at IS NULL
      )
      UNION ALL
      SELECT 'source_replacement_invariant', job.id::text,
        'Source-replacement deletion does not match its image lifecycle snapshot'
      FROM public.media_deletion_jobs job
      LEFT JOIN public.images image ON image.id = job.image_id
      WHERE job.reason = 'source_replaced' AND (
        image.id IS NULL OR image.original_bucket IS DISTINCT FROM job.bucket
        OR image.original_key IS DISTINCT FROM job.object_key
        OR image.optimized_key IS NULL
      )
      ORDER BY category, id`)
    await client.query('COMMIT')
    return { asOf: new Date(clock.rows[0].as_of), jobs: jobs.rows, invariants: invariants.rows }
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally {
    await client.end()
  }
}

function reconciliationFindings(value: unknown): Finding[] {
  if (!isRecord(value) || value.schemaVersion !== 2 || !isRecord(value.anomalies)
    || !isRecord(value.imageClassifications) || !isRecord(value.objectClassifications)) {
    throw new Error('Reconciliation input must be a schemaVersion 2 artifact')
  }
  const findings: Finding[] = []
  const generatedAt = typeof value.generatedAt === 'string' ? new Date(value.generatedAt) : new Date()
  const add = (category: string, entries: unknown, severity: Severity): void => {
    if (!Array.isArray(entries)) throw new Error(`Reconciliation category ${category} is invalid`)
    entries.forEach((entry, index) => {
      const record: Record<string, unknown> = isRecord(entry) ? entry : { value: entry }
      const id = typeof record.imageId === 'string' ? record.imageId
        : typeof record.key === 'string' ? record.key
          : typeof record.value === 'string' ? record.value : `${category}-${index}`
      findings.push({ category, severity, id, ageSeconds: null, snapshot: record })
    })
  }
  add('missing_database_object', value.anomalies.missingDatabaseObjects, 'critical')
  add('dangling_image_reference', value.anomalies.danglingImageReferences, 'critical')
  add('missing_source', value.imageClassifications.missingSource, 'critical')
  add('ambiguous_source', value.imageClassifications.ambiguous, 'critical')
  add('possible_r2_orphan', value.objectClassifications.possibleOrphan, 'info')
  const allObjects = [
    value.objectClassifications.referenced,
    value.objectClassifications.deletionTracked,
    value.objectClassifications.possibleOrphan,
  ]
  for (const entries of allObjects) {
    if (!Array.isArray(entries)) throw new Error('Reconciliation object category is invalid')
    for (const entry of entries) {
      if (!isRecord(entry) || typeof entry.key !== 'string' || !entry.key.startsWith('images/staging/')) continue
      if (typeof entry.lastModified !== 'string') continue
      const ageSeconds = ageInSeconds(generatedAt, entry.lastModified)
      findings.push({
        category: 'stale_staging_object',
        severity: classifyLifecycleAge(ageSeconds),
        id: entry.key,
        ageSeconds,
        snapshot: entry,
        detail: 'Prepared staging object is older than the temporary-source SLO; age does not authorize deletion.',
      })
    }
  }
  return findings
}

function jobFinding(row: JobRow, asOf: Date): Finding {
  const timestamp = row.status === 'queued' ? row.run_at : row.updated_at
  const ageSeconds = ageInSeconds(asOf, timestamp)
  const terminal = row.status === 'failed'
  const category = row.kind === 'ingest_job' ? `ingest_${row.status}`
    : row.reason === 'source_replaced' && row.status === 'queued' && !row.delivery_verified_at
      ? 'source_replacement_awaiting_verification' : `deletion_${row.status}`
  return {
    category,
    severity: classifyLifecycleAge(ageSeconds, terminal),
    id: row.id,
    ageSeconds,
    snapshot: {
      kind: row.kind, id: row.id, status: row.status, updatedAt: row.updated_at,
      runAt: row.run_at, lockedAt: row.locked_at, lockedBy: row.locked_by,
      attempts: row.attempts, maxAttempts: row.max_attempts, imageId: row.image_id,
      reason: row.reason, bucket: row.bucket, objectKey: row.object_key,
      deliveryVerifiedAt: row.delivery_verified_at,
    },
  }
}

async function main(): Promise<void> {
  let report: Record<string, unknown>
  try {
    const lifecycle = await readLifecycle()
    const findings = lifecycle.jobs.map((row) => jobFinding(row, lifecycle.asOf))
    findings.push(...lifecycle.invariants.map((row) => ({
      category: row.category, severity: 'critical' as const, id: row.id, ageSeconds: null,
      snapshot: {}, detail: row.detail,
    })))
    if (RECONCILIATION_PATH) {
      const reconciliation = JSON.parse(await readFile(RECONCILIATION_PATH, 'utf8')) as unknown
      findings.push(...reconciliationFindings(reconciliation))
    }
    findings.sort((left, right) => left.category.localeCompare(right.category, 'en') || left.id.localeCompare(right.id, 'en'))
    const counts = { info: 0, warning: 0, critical: 0 }
    for (const finding of findings) counts[finding.severity] += 1
    const grouped = Object.groupBy(findings, (finding) => finding.category)
    const categories = REPORTED_CATEGORIES.map((category) => ({ category, count: grouped[category]?.length ?? 0 }))
    report = {
      schemaVersion: 1, generatedAt: lifecycle.asOf.toISOString(), readOnly: true,
      thresholdsSeconds: { warningAfter: WARNING_SECONDS, criticalAfter: CRITICAL_SECONDS },
      summary: { ...counts, status: counts.critical > 0 ? 'critical' : counts.warning > 0 ? 'warning' : 'healthy', categories },
      findings,
    }
    if (counts.critical > 0) process.exitCode = 1
  } catch (error) {
    report = {
      schemaVersion: 1, generatedAt: new Date().toISOString(), readOnly: true,
      thresholdsSeconds: { warningAfter: WARNING_SECONDS, criticalAfter: CRITICAL_SECONDS },
      summary: { info: 0, warning: 0, critical: 1, status: 'critical', categories: [] },
      findings: [], fatalError: errorMessage(error),
    }
    process.exitCode = 1
  }
  await writeFile(OUTPUT_PATH, `${JSON.stringify(report, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
  console.log(JSON.stringify(report.summary))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) void main()
