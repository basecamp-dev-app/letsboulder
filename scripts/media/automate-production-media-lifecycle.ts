import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

import { S3Client } from '@aws-sdk/client-s3'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

import {
  loadCurrentMissingReferences,
  parseMissingDrafts,
  parseMissingImages,
  parseOrphans,
  parseSourceReplacements,
  requireMatchingOrphan,
  requireMissing,
  verifySourceReplacement,
  type MissingReference,
  type Orphan,
  type SourceReplacement,
} from '@/scripts/media/remediate-production-media'
import type { Database } from '@/types/database'

const BUCKET = 'lb-prod-media-private'
const KNOWN_BLOCKED_IMAGE_ID = 'e9c0ce67-507d-42ec-8311-697ce1649aac'
const SECRET_PATTERN = /(password|secret|token|authorization|service[_-]?role|connection[_-]?string)/i

export type RecoveryMode = 'observe' | 'apply'
export type CandidateKind = 'source_replacement' | 'missing_reference' | 'possible_orphan'
export type RecoverySelection = {
  kind: CandidateKind
  key: string
  fingerprint: string
  firstObservedAt: string
  lastObservedAt: string
  observationCount: number
  eligible: boolean
  payload: Record<string, unknown>
}
type RecoveryAction = Record<string, unknown> & {
  kind: CandidateKind
  key: string
  status: string
  timestamp: string
}
type WorkerState = {
  jobId: string
  objectKey: string
  status: string
  attempts: number
  error: string | null
  timedOut: boolean
}
type RecoveryReport = {
  schemaVersion: 1
  mode: RecoveryMode
  commitSha: string
  recoveryRunId: string
  generatedAt: string
  evidenceDigest: string
  healthBefore: { summary: unknown }
  selections: RecoverySelection[]
  actions: RecoveryAction[]
  blocked: RecoveryAction[]
  workerFollowUp: WorkerState[]
  fatalError: string | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Missing required environment variable: ${name}`)
  return value
}

function safeError(error: unknown): string {
  return (error instanceof Error ? error.message : 'Unknown production media recovery error')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .slice(0, 2_000)
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (!isRecord(value)) return value
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]))
}

function digest(value: string): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`
}

function fingerprint(kind: CandidateKind, payload: Record<string, unknown>): string {
  return digest(JSON.stringify(canonicalize({ kind, payload })))
}

function parseBatchSize(value: string): number {
  const size = Number(value)
  if (!Number.isInteger(size) || size < 1 || size > 25) throw new Error('BATCH_SIZE must be between 1 and 25')
  return size
}

function parseMinimumDelay(value: string): number {
  const seconds = Number(value)
  if (!Number.isInteger(seconds) || seconds < 900 || seconds > 604_800) {
    throw new Error('MINIMUM_OBSERVATION_DELAY_SECONDS must be between 900 and 604800')
  }
  return seconds
}

function validateHealth(value: unknown): { generatedAt: string; summary: unknown } {
  if (!isRecord(value) || value.schemaVersion !== 1 || value.readOnly !== true
    || typeof value.generatedAt !== 'string' || Number.isNaN(Date.parse(value.generatedAt))
    || !isRecord(value.summary) || !Array.isArray(value.findings)) {
    throw new Error('Lifecycle health evidence must be a read-only schemaVersion 1 report')
  }
  if (typeof value.fatalError === 'string' && value.fatalError) {
    throw new Error(`Lifecycle health evidence failed: ${value.fatalError}`)
  }
  return { generatedAt: value.generatedAt, summary: value.summary }
}

function previousSelections(value: unknown): Map<string, RecoverySelection> {
  if (!isRecord(value) || value.schemaVersion !== 1 || !Array.isArray(value.selections)) return new Map()
  const entries = value.selections.flatMap((selection): Array<[string, RecoverySelection]> => {
    if (!isRecord(selection) || typeof selection.kind !== 'string' || typeof selection.key !== 'string'
      || typeof selection.fingerprint !== 'string' || typeof selection.firstObservedAt !== 'string'
      || typeof selection.lastObservedAt !== 'string' || typeof selection.observationCount !== 'number'
      || typeof selection.eligible !== 'boolean' || !isRecord(selection.payload)) return []
    const parsed = selection as RecoverySelection
    return [[`${parsed.kind}:${parsed.key}`, parsed]]
  })
  return new Map(entries)
}

function uniqueMissing(artifact: unknown): Array<Omit<MissingReference, 'status' | 'processingStatus'>> {
  const byLogicalRecord = new Map<string, Omit<MissingReference, 'status' | 'processingStatus'>>()
  for (const item of [...parseMissingImages(artifact), ...parseMissingDrafts(artifact)]) {
    const key = `${item.kind}:${item.id}`
    const existing = byLogicalRecord.get(key)
    if (existing && existing.objectKey !== item.objectKey) {
      throw new Error(`Overlapping missing findings disagree for ${key}`)
    }
    byLogicalRecord.set(key, item)
  }
  return [...byLogicalRecord.values()].sort((left, right) =>
    `${left.kind}:${left.id}`.localeCompare(`${right.kind}:${right.id}`, 'en'))
}

export function buildRecoverySelections(
  artifact: unknown,
  previousReport: unknown,
  asOf: string,
  minimumDelaySeconds: number,
  batchSize: number,
): RecoverySelection[] {
  const previous = previousSelections(previousReport)
  const candidates: Array<{ kind: CandidateKind; key: string; payload: Record<string, unknown> }> = [
    ...parseSourceReplacements(artifact).map((item) => ({
      kind: 'source_replacement' as const, key: item.jobId, payload: { ...item },
    })).slice(0, batchSize),
    ...uniqueMissing(artifact).map((item) => ({
      kind: 'missing_reference' as const, key: `${item.kind}:${item.id}`, payload: { ...item },
    })).slice(0, batchSize),
    ...parseOrphans(artifact).sort((a, b) => a.key.localeCompare(b.key, 'en')).map((item) => ({
      kind: 'possible_orphan' as const, key: item.key, payload: { ...item },
    })).slice(0, batchSize),
  ]
  return candidates.map((candidate) => {
    const currentFingerprint = fingerprint(candidate.kind, candidate.payload)
    const prior = previous.get(`${candidate.kind}:${candidate.key}`)
    const firstTime = Date.parse(prior?.firstObservedAt ?? '')
    const lastTime = Date.parse(prior?.lastObservedAt ?? '')
    const currentTime = Date.parse(asOf)
    const consistent = prior?.fingerprint === currentFingerprint
      && Number.isFinite(firstTime) && Number.isFinite(lastTime)
      && firstTime <= lastTime && lastTime < currentTime
    const firstObservedAt = consistent ? prior.firstObservedAt : asOf
    const observationCount = consistent ? prior.observationCount + 1 : 1
    const elapsed = Math.floor((currentTime - Date.parse(firstObservedAt)) / 1_000)
    return {
      ...candidate,
      fingerprint: currentFingerprint,
      firstObservedAt,
      lastObservedAt: asOf,
      observationCount,
      eligible: candidate.kind === 'source_replacement' || (consistent && elapsed >= minimumDelaySeconds),
    }
  })
}

export function assertSecretFree(value: unknown): void {
  const visit = (item: unknown, path: string): void => {
    if (Array.isArray(item)) return item.forEach((entry, index) => visit(entry, `${path}[${index}]`))
    if (!isRecord(item)) {
      if (typeof item === 'string' && /(?:postgres(?:ql)?:\/\/|bearer\s+|eyJ[A-Za-z0-9_-]{16,}\.)/i.test(item)) {
        throw new Error(`Recovery report contains secret-like data at ${path}`)
      }
      return
    }
    for (const [key, entry] of Object.entries(item)) {
      if (SECRET_PATTERN.test(key)) throw new Error(`Recovery report contains a forbidden field at ${path}.${key}`)
      visit(entry, `${path}.${key}`)
    }
  }
  visit(value, '$')
}

async function writeReport(path: string, report: RecoveryReport): Promise<void> {
  assertSecretFree(report)
  await writeFile(path, `${JSON.stringify(report, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
}

function sourceCandidate(selection: RecoverySelection): SourceReplacement {
  const { jobId, imageId, objectKey } = selection.payload
  if (typeof jobId !== 'string' || typeof imageId !== 'string' || typeof objectKey !== 'string') {
    throw new Error(`Invalid source-replacement selection: ${selection.key}`)
  }
  return { jobId, imageId, objectKey }
}

function missingCandidate(selection: RecoverySelection): Omit<MissingReference, 'status' | 'processingStatus'> {
  const { kind, id, objectKey } = selection.payload
  if ((kind !== 'image' && kind !== 'draft_image') || typeof id !== 'string' || typeof objectKey !== 'string') {
    throw new Error(`Invalid missing-reference selection: ${selection.key}`)
  }
  return { kind, id, objectKey }
}

function orphanCandidate(selection: RecoverySelection): Orphan {
  const { key, size, lastModified, etag } = selection.payload
  if (typeof key !== 'string' || typeof size !== 'number' || typeof lastModified !== 'string' || typeof etag !== 'string') {
    throw new Error(`Invalid orphan selection: ${selection.key}`)
  }
  return { key, size, lastModified, etag }
}

function action(selection: RecoverySelection, status: string, timestamp: string, extra: Record<string, unknown> = {}): RecoveryAction {
  return {
    kind: selection.kind, key: selection.key, status, timestamp,
    mutationApplied: false, ...selection.payload, ...extra,
  }
}

function blockedDetail(error: unknown): Record<string, unknown> {
  const message = safeError(error)
  const match = /status (\d+): (https:\/\/\S+)/.exec(message)
  const url = match?.[2] ?? /(https:\/\/[^\s:]+(?:\/[^\s:]*)?)/.exec(message)?.[1]
  return {
    error: message,
    ...(url ? { failedPublicUrl: url } : {}),
    ...(match ? { httpStatus: Number(match[1]) } : {}),
  }
}

async function pollDeletionJobs(
  supabase: SupabaseClient<Database>,
  jobIds: string[],
  timeoutSeconds: number,
  intervalSeconds: number,
): Promise<WorkerState[]> {
  if (!jobIds.length) return []
  const deadline = Date.now() + timeoutSeconds * 1_000
  let rows: Array<{ id: string; object_key: string; status: string; attempts: number; last_error: string | null }> = []
  do {
    const response = await supabase.from('media_deletion_jobs')
      .select('id,object_key,status,attempts,last_error').in('id', jobIds).order('id')
    if (response.error) throw response.error
    rows = response.data ?? []
    if (rows.length !== jobIds.length) throw new Error('One or more deletion jobs disappeared during worker polling')
    if (rows.every((row) => !['queued', 'processing'].includes(row.status))) break
    if (Date.now() >= deadline) break
    await new Promise((resolve) => setTimeout(resolve, intervalSeconds * 1_000))
  } while (true)
  return rows.map((row) => ({
    jobId: row.id,
    objectKey: row.object_key,
    status: row.status,
    attempts: row.attempts,
    error: row.last_error,
    timedOut: ['queued', 'processing'].includes(row.status) && Date.now() >= deadline,
  }))
}

async function loadPreviousReport(path: string | undefined): Promise<unknown> {
  if (!path) return null
  try {
    return JSON.parse(await readFile(path, 'utf8')) as unknown
  } catch (error) {
    if (isRecord(error) && error.code === 'ENOENT') return null
    throw error
  }
}

async function main(): Promise<void> {
  const output = process.env.RECOVERY_OUTPUT?.trim() || 'production-media-lifecycle-automation.json'
  const healthPath = requiredEnv('LIFECYCLE_HEALTH_INPUT')
  const healthText = await readFile(healthPath, 'utf8')
  const healthArtifact = JSON.parse(healthText) as unknown
  const health = validateHealth(healthArtifact)
  const mode = requiredEnv('RECOVERY_MODE') as RecoveryMode
  if (mode !== 'observe' && mode !== 'apply') throw new Error('RECOVERY_MODE must be observe or apply')
  if (mode === 'apply' && requiredEnv('CONFIRMATION') !== 'APPLY_MEDIA_LIFECYCLE_RECOVERY') {
    throw new Error('Apply confirmation must exactly equal APPLY_MEDIA_LIFECYCLE_RECOVERY')
  }
  const commitSha = requiredEnv('COMMIT_SHA')
  const recoveryRunId = requiredEnv('RECOVERY_RUN_ID')
  if (!/^[0-9a-f]{40}$/.test(commitSha) || !/^\d+$/.test(recoveryRunId)) throw new Error('Run provenance is invalid')
  const batchSize = parseBatchSize(requiredEnv('BATCH_SIZE'))
  const minimumDelay = parseMinimumDelay(requiredEnv('MINIMUM_OBSERVATION_DELAY_SECONDS'))
  const previous = await loadPreviousReport(process.env.PREVIOUS_RECOVERY_INPUT?.trim())
  const selections = buildRecoverySelections(healthArtifact, previous, health.generatedAt, minimumDelay, batchSize)
  const report: RecoveryReport = {
    schemaVersion: 1,
    mode,
    commitSha,
    recoveryRunId,
    generatedAt: new Date().toISOString(),
    evidenceDigest: digest(healthText),
    healthBefore: { summary: health.summary },
    selections,
    actions: [],
    blocked: [],
    workerFollowUp: [],
    fatalError: null,
  }
  await writeReport(output, report)

  let s3: S3Client | null = null
  try {
    const supabase = createClient<Database>(requiredEnv('SUPABASE_URL'), requiredEnv('SUPABASE_SERVICE_ROLE_KEY'), {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    s3 = new S3Client({
      region: 'auto',
      endpoint: requiredEnv('R2_ENDPOINT'),
      credentials: {
        accessKeyId: requiredEnv('R2_ACCESS_KEY_ID'),
        secretAccessKey: requiredEnv('R2_SECRET_ACCESS_KEY'),
      },
    })
    const cdnUrl = requiredEnv('MEDIA_CDN_URL').replace(/\/$/, '')
    if (new URL(cdnUrl).protocol !== 'https:') throw new Error('MEDIA_CDN_URL must use HTTPS')
    const workerJobIds: string[] = []

    for (const selection of selections) {
      const timestamp = new Date().toISOString()
      if (selection.kind !== 'source_replacement' && !selection.eligible) {
        report.actions.push(action(selection, 'retained', timestamp, { reason: 'awaiting_consistent_observation' }))
        continue
      }
      try {
        if (selection.kind === 'source_replacement') {
          const candidate = sourceCandidate(selection)
          const knownBlocked = candidate.imageId === KNOWN_BLOCKED_IMAGE_ID
          const result = await verifySourceReplacement(
            supabase, s3, candidate, cdnUrl, mode === 'observe' || knownBlocked,
          )
          if (knownBlocked) {
            const entry = action(selection, 'blocked', timestamp, {
              ...result,
              reason: 'known_blocked_candidate_requires_separate_resolution',
            })
            report.actions.push(entry)
            report.blocked.push(entry)
          } else {
            const status = mode === 'observe' ? 'validated' : 'delivery_verified'
            report.actions.push(action(selection, status, timestamp, {
              ...result, mutationApplied: mode === 'apply',
            }))
            if (mode === 'apply') workerJobIds.push(candidate.jobId)
          }
        } else if (selection.kind === 'missing_reference') {
          const candidate = missingCandidate(selection)
          const current = await loadCurrentMissingReferences(supabase, [candidate])
          if (current.length !== 1) throw new Error(`Missing reference disappeared: ${selection.key}`)
          await requireMissing(s3, current[0])
          if (mode === 'observe') {
            report.actions.push(action(selection, 'validated', timestamp))
          } else {
            const response = await supabase.rpc('quarantine_missing_media_references', {
              p_items: current,
              p_source_run_id: Number(recoveryRunId),
              p_artifact_digest: report.evidenceDigest,
            })
            if (response.error) throw response.error
            report.actions.push(action(selection, 'quarantined', timestamp, {
              mutationApplied: true, result: response.data ?? [],
            }))
          }
        } else {
          const candidate = orphanCandidate(selection)
          await requireMatchingOrphan(s3, candidate)
          if (mode === 'observe') {
            report.actions.push(action(selection, 'validated', timestamp))
          } else {
            const response = await supabase.rpc('enqueue_reconciled_media_orphans', {
              p_bucket: BUCKET,
              p_keys: [candidate.key],
              p_expected_etags: [candidate.etag],
              p_expected_bytes: [candidate.size],
              p_reconciliation_run_id: Number(recoveryRunId),
              p_artifact_digest: report.evidenceDigest,
            })
            if (response.error) throw response.error
            const rows = Array.isArray(response.data) ? response.data.filter(isRecord) : []
            const jobId = rows.find((row) => typeof row.job_id === 'string')?.job_id
            if (typeof jobId !== 'string') throw new Error('Orphan enqueue RPC returned no durable deletion job ID')
            workerJobIds.push(jobId)
            report.actions.push(action(selection, 'orphan_enqueued', timestamp, { mutationApplied: true, jobId }))
          }
        }
      } catch (error) {
        const entry = action(selection, 'blocked', timestamp, blockedDetail(error))
        report.actions.push(entry)
        report.blocked.push(entry)
      }
      await writeReport(output, report)
    }

    if (mode === 'apply' && workerJobIds.length) {
      const timeout = Number(process.env.POLL_TIMEOUT_SECONDS?.trim() || '600')
      const interval = Number(process.env.POLL_INTERVAL_SECONDS?.trim() || '15')
      if (!Number.isInteger(timeout) || timeout < 0 || timeout > 3_600
        || !Number.isInteger(interval) || interval < 5 || interval > 60) throw new Error('Worker polling configuration is invalid')
      report.workerFollowUp = await pollDeletionJobs(supabase, workerJobIds, timeout, interval)
      for (const item of report.workerFollowUp.filter((state) => state.status === 'failed' || state.timedOut)) {
        report.blocked.push({
          kind: 'possible_orphan', key: item.objectKey,
          status: item.timedOut ? 'timed_out' : 'blocked', timestamp: new Date().toISOString(),
          mutationApplied: true, jobId: item.jobId, workerStatus: item.status, error: item.error,
        })
      }
    }
  } catch (error) {
    report.fatalError = safeError(error)
    process.exitCode = 1
  } finally {
    s3?.destroy()
    await writeReport(output, report)
    if (report.blocked.length) process.exitCode = 1
    console.log(JSON.stringify({
      mode: report.mode,
      selected: report.selections.length,
      actions: report.actions.length,
      blocked: report.blocked.length,
      fatalError: report.fatalError,
    }))
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main().catch(async (error) => {
    process.exitCode = 1
    const output = process.env.RECOVERY_OUTPUT?.trim() || 'production-media-lifecycle-automation.json'
    let report: Record<string, unknown> = { schemaVersion: 1 }
    try {
      const current = JSON.parse(await readFile(output, 'utf8')) as unknown
      if (isRecord(current)) report = current
    } catch {
      // The fallback report below is sufficient when initialization itself failed.
    }
    report.fatalError = safeError(error)
    assertSecretFree(report)
    await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
    console.error(report.fatalError)
  })
}
