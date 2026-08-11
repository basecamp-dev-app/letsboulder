import { readFile, writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

import { Client } from 'pg'

const MAX_IDS = 25
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const SNAPSHOT_FIELDS = [
  'attempts', 'bucket', 'deliveryVerifiedAt', 'id', 'imageId', 'kind', 'lockedAt',
  'lockedBy', 'maxAttempts', 'objectKey', 'reason', 'runAt', 'status', 'updatedAt',
]

type RecoveryKind = 'ingest_job' | 'deletion_job'
type Snapshot = {
  kind: RecoveryKind
  id: string
  status: string
  updatedAt: string
  runAt: string
  lockedAt: string | null
  lockedBy: string | null
  attempts: number
  maxAttempts: number
  imageId: string | null
  reason: string | null
  bucket: string | null
  objectKey: string | null
  deliveryVerifiedAt: string | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

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

function exactSnapshot(value: unknown): Snapshot | null {
  if (!isRecord(value) || (value.kind !== 'ingest_job' && value.kind !== 'deletion_job')
    || Object.keys(value).sort().join(',') !== SNAPSHOT_FIELDS.join(',')
    || typeof value.id !== 'string' || !UUID.test(value.id) || typeof value.status !== 'string'
    || typeof value.updatedAt !== 'string' || Number.isNaN(Date.parse(value.updatedAt))
    || typeof value.runAt !== 'string' || Number.isNaN(Date.parse(value.runAt))
    || (value.lockedAt !== null && typeof value.lockedAt !== 'string')
    || (value.lockedBy !== null && typeof value.lockedBy !== 'string')
    || !Number.isInteger(value.attempts) || !Number.isInteger(value.maxAttempts)
    || (value.imageId !== null && typeof value.imageId !== 'string')
    || (value.reason !== null && typeof value.reason !== 'string')
    || (value.bucket !== null && typeof value.bucket !== 'string')
    || (value.objectKey !== null && typeof value.objectKey !== 'string')
    || (value.deliveryVerifiedAt !== null && typeof value.deliveryVerifiedAt !== 'string')) return null
  return value as Snapshot
}

export function validateRecoveryInput(
  artifact: unknown,
  kind: string,
  idsValue: string,
): Snapshot[] {
  if (kind !== 'ingest_job' && kind !== 'deletion_job') throw new Error('RECOVERY_KIND is invalid')
  const ids = idsValue.split(',').map((id) => id.trim().toLowerCase()).filter(Boolean)
  if (ids.length < 1 || ids.length > MAX_IDS || ids.some((id) => !UUID.test(id))) {
    throw new Error(`RECOVERY_IDS must contain 1 to ${MAX_IDS} comma-separated UUIDs`)
  }
  if (new Set(ids).size !== ids.length) throw new Error('RECOVERY_IDS contains duplicates')
  if (!isRecord(artifact) || artifact.schemaVersion !== 1 || !isRecord(artifact.summary)
    || artifact.readOnly !== true || !Array.isArray(artifact.findings)) {
    throw new Error('Health artifact has an invalid schema')
  }
  const snapshots = artifact.findings.flatMap((finding): Snapshot[] => {
    if (!isRecord(finding) || finding.severity !== 'critical') return []
    const snapshot = exactSnapshot(finding.snapshot)
    return snapshot ? [snapshot] : []
  })
  const kindSnapshots = snapshots.filter((snapshot) => snapshot.kind === kind)
  const byId = new Map(kindSnapshots.map((snapshot) => [snapshot.id.toLowerCase(), snapshot]))
  if (byId.size !== kindSnapshots.length) throw new Error('Health artifact contains duplicate job snapshots')
  const selected = ids.map((id) => byId.get(id))
  if (selected.some((snapshot) => !snapshot)) throw new Error('Every ID must select a critical exact snapshot of the requested kind')
  const result = selected as Snapshot[]
  if (result.some((snapshot) => snapshot.reason === 'reconciled_orphan')) {
    throw new Error('Generic lifecycle recovery rejects reconciled_orphan jobs')
  }
  return result
}

export function validateRecoveredRows(
  rows: Array<{ id: string; replay_of_job_id: string | null }>,
  snapshots: Snapshot[],
): string[] {
  const expectedIds = snapshots.map((snapshot) => snapshot.id.toLowerCase()).sort()
  const replayedIds = rows.map((row) => row.replay_of_job_id?.toLowerCase() ?? '').sort()
  if (JSON.stringify(replayedIds) !== JSON.stringify(expectedIds)) {
    throw new Error('Recovery RPC returned an inconsistent result')
  }
  return rows.map((row) => row.id)
}

async function main(): Promise<void> {
  const output = process.env.RECOVERY_OUTPUT?.trim() || 'production-media-lifecycle-recovery.json'
  const result: Record<string, unknown> = { schemaVersion: 1, dryRun: true, selected: [], recovered: [], readOnly: true }
  try {
    if (requiredEnv('CONFIRMATION') !== 'RECOVER_MEDIA_LIFECYCLE') {
      throw new Error('CONFIRMATION must exactly equal RECOVER_MEDIA_LIFECYCLE')
    }
    const dryRun = requiredEnv('DRY_RUN') === 'true'
      ? true : requiredEnv('DRY_RUN') === 'false' ? false : (() => { throw new Error('DRY_RUN must be true or false') })()
    const runId = requiredEnv('SOURCE_RUN_ID')
    const digest = requiredEnv('ARTIFACT_DIGEST')
    if (!/^\d+$/.test(runId) || !/^sha256:[0-9a-f]{64}$/.test(digest)) throw new Error('Source run ID or artifact digest is invalid')
    const artifact = JSON.parse(await readFile(requiredEnv('LIFECYCLE_HEALTH_INPUT'), 'utf8')) as unknown
    const snapshots = validateRecoveryInput(artifact, requiredEnv('RECOVERY_KIND'), requiredEnv('RECOVERY_IDS'))
    Object.assign(result, { dryRun, selected: snapshots, readOnly: dryRun })

    const client = new Client(databaseConfig())
    await client.connect()
    try {
      await client.query(`BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE${dryRun ? ' READ ONLY' : ''}`)
      await client.query('SET LOCAL ROLE service_role')
      await client.query("SELECT set_config('request.jwt.claims', '{\"role\":\"service_role\"}', true)")
      const functionName = snapshots[0].kind === 'ingest_job'
        ? 'recover_media_ingest_jobs' : 'recover_media_deletion_jobs'
      if (dryRun) {
        const table = snapshots[0].kind === 'ingest_job' ? 'media_jobs' : 'media_deletion_jobs'
        const rows = await client.query<{ id: string }>(`
          WITH reviewed AS (SELECT value FROM jsonb_array_elements($2::jsonb))
          SELECT job.id::text
          FROM public.${table} job
          JOIN reviewed ON reviewed.value->>'id' = job.id::text
            AND reviewed.value = jsonb_build_object(
              'kind', $1::text, 'id', job.id::text, 'status', job.status,
              'updatedAt', job.updated_at::text, 'runAt', job.run_at::text,
              'lockedAt', job.locked_at::text, 'lockedBy', job.locked_by,
              'attempts', job.attempts, 'maxAttempts', job.max_attempts,
              'imageId', job.image_id::text,
              'reason', ${table === 'media_jobs' ? 'NULL' : 'job.reason'},
              'bucket', ${table === 'media_jobs' ? 'NULL' : 'job.bucket'},
              'objectKey', ${table === 'media_jobs' ? 'NULL' : 'job.object_key'},
              'deliveryVerifiedAt', ${table === 'media_jobs' ? 'NULL' : 'job.delivery_verified_at::text'}
            )
        `, [snapshots[0].kind, JSON.stringify(snapshots)])
        if (rows.rows.length !== snapshots.length) throw new Error('Current jobs do not exactly match reviewed snapshots')
      } else {
        const recovered = await client.query<{ id: string; replay_of_job_id: string | null }>(
          `SELECT id::text, replay_of_job_id::text FROM public.${functionName}($1::jsonb, $2::bigint, $3::text) ORDER BY id`,
          [JSON.stringify(snapshots), runId, digest],
        )
        result.recovered = validateRecoveredRows(recovered.rows, snapshots)
      }
      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined)
      throw error
    } finally {
      await client.end()
    }
  } catch (error) {
    result.fatalError = error instanceof Error ? error.message : 'Unknown recovery error'
    process.exitCode = 1
  }
  await writeFile(output, `${JSON.stringify(result, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
  console.log(JSON.stringify({ dryRun: result.dryRun, selected: (result.selected as unknown[]).length, fatalError: result.fatalError }))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) void main()
