import { HeadObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { readFile, writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

import type { Database } from '@/types/database'

const BUCKET = 'lb-prod-media-private'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

type Finding = { category: string; snapshot: Record<string, unknown> }
export type MissingReference = {
  kind: 'image' | 'draft_image'
  id: string
  objectKey: string
  status: string
  processingStatus: string
}
export type Orphan = { key: string; size: number; lastModified: string; etag: string }
export type SourceReplacement = { jobId: string; imageId: string; objectKey: string }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Missing required environment variable: ${name}`)
  return value
}

function parseBoolean(value: string): boolean {
  if (value === 'true') return true
  if (value === 'false') return false
  throw new Error('DRY_RUN must be true or false')
}

function normalizeEtag(value: string): string {
  return value.trim().replace(/^"|"$/g, '')
}

function parseBatchSize(value: string): number {
  const size = Number(value)
  if (!Number.isInteger(size) || size < 1 || size > 25) throw new Error('BATCH_SIZE must be between 1 and 25')
  return size
}

function validateArtifact(input: unknown): Finding[] {
  if (!isRecord(input) || input.schemaVersion !== 1 || input.readOnly !== true || !Array.isArray(input.findings)) {
    throw new Error('Lifecycle health input must be a read-only schemaVersion 1 artifact')
  }
  return input.findings.map((finding) => {
    if (!isRecord(finding) || typeof finding.category !== 'string' || !isRecord(finding.snapshot)) {
      throw new Error('Lifecycle health artifact contains an invalid finding')
    }
    return { category: finding.category, snapshot: finding.snapshot }
  })
}

export function parseMissingImages(input: unknown): Array<Omit<MissingReference, 'status' | 'processingStatus'>> {
  return validateArtifact(input).filter((finding) => finding.category === 'missing_source').map((finding) => {
    const snapshot = finding.snapshot
    if (typeof snapshot.imageId !== 'string' || !UUID.test(snapshot.imageId)
      || !Array.isArray(snapshot.sourceKeys) || snapshot.sourceKeys.length !== 1
      || typeof snapshot.sourceKeys[0] !== 'string' || snapshot.canonicalKey !== null) {
      throw new Error('Missing-source finding is not an exact uncanonicalized image snapshot')
    }
    return { kind: 'image' as const, id: snapshot.imageId, objectKey: snapshot.sourceKeys[0] }
  })
}

export function parseMissingDrafts(input: unknown): Array<Omit<MissingReference, 'status' | 'processingStatus'>> {
  const result: Array<Omit<MissingReference, 'status' | 'processingStatus'>> = []
  for (const finding of validateArtifact(input).filter((item) => item.category === 'missing_database_object')) {
    const key = finding.snapshot.key
    const surfaces = finding.snapshot.surfaces
    if (typeof key !== 'string' || !Array.isArray(surfaces)) throw new Error('Invalid missing-object finding')
    for (const surface of surfaces) {
      if (!isRecord(surface) || surface.surface !== 'submission_draft_images.storage') continue
      if (typeof surface.recordId !== 'string' || !UUID.test(surface.recordId) || surface.imageId !== null) {
        throw new Error('Invalid missing draft-image surface')
      }
      result.push({ kind: 'draft_image', id: surface.recordId, objectKey: key })
    }
  }
  return result
}

export function parseOrphans(input: unknown): Orphan[] {
  return validateArtifact(input).filter((finding) => finding.category === 'possible_r2_orphan').map((finding) => {
    const item = finding.snapshot
    if (typeof item.key !== 'string' || typeof item.size !== 'number' || !Number.isSafeInteger(item.size)
      || item.size < 1 || typeof item.lastModified !== 'string' || Number.isNaN(Date.parse(item.lastModified))
      || typeof item.etag !== 'string' || !normalizeEtag(item.etag)) {
      throw new Error('Invalid possible-orphan finding')
    }
    if (!Array.isArray(item.surfaces) || item.surfaces.length !== 0
      || !Array.isArray(item.historicalSurfaces) || item.historicalSurfaces.length !== 0
      || item.namespaceImageExists !== false) throw new Error('Possible orphan is not eligible for remediation')
    return { key: item.key, size: item.size, lastModified: item.lastModified, etag: normalizeEtag(item.etag) }
  })
}

export function parseSourceReplacements(input: unknown): SourceReplacement[] {
  return validateArtifact(input)
    .filter((finding) => finding.category === 'source_replacement_awaiting_verification')
    .map((finding) => {
      const snapshot = finding.snapshot
      if (typeof snapshot.id !== 'string' || !UUID.test(snapshot.id)
        || typeof snapshot.imageId !== 'string' || !UUID.test(snapshot.imageId)
        || snapshot.kind !== 'deletion_job' || snapshot.status !== 'queued'
        || snapshot.reason !== 'source_replaced' || snapshot.bucket !== BUCKET
        || typeof snapshot.objectKey !== 'string' || snapshot.deliveryVerifiedAt !== null) {
        throw new Error('Invalid source-replacement finding')
      }
      return { jobId: snapshot.id, imageId: snapshot.imageId, objectKey: snapshot.objectKey }
    })
}

function isNotFound(error: unknown): boolean {
  if (!isRecord(error)) return false
  return error.name === 'NotFound' || error.name === 'NoSuchKey'
    || (isRecord(error.$metadata) && error.$metadata.httpStatusCode === 404)
}

async function requireMissing(s3: S3Client, item: { objectKey: string }): Promise<void> {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: item.objectKey }))
  } catch (error) {
    if (isNotFound(error)) return
    throw error
  }
  throw new Error(`Object is present and must not be quarantined: ${item.objectKey}`)
}

async function requireMatchingOrphan(s3: S3Client, item: Orphan): Promise<void> {
  const head = await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: item.key }))
  const modified = head.LastModified ? Math.floor(head.LastModified.getTime() / 1_000) : null
  if (head.ContentLength !== item.size || normalizeEtag(head.ETag ?? '') !== item.etag
    || modified !== Math.floor(new Date(item.lastModified).getTime() / 1_000)) {
    throw new Error(`Orphan metadata drifted after reconciliation: ${item.key}`)
  }
}

function encodeObjectPath(key: string): string {
  return key.split('/').filter(Boolean).map(encodeURIComponent).join('/')
}

async function requirePublicImage(url: string): Promise<void> {
  const response = await fetch(url, { method: 'GET', redirect: 'follow', signal: AbortSignal.timeout(60_000) })
  const contentType = response.headers.get('Content-Type')?.split(';', 1)[0]?.trim().toLowerCase()
  if (response.status !== 200 || !contentType?.startsWith('image/')) {
    await response.body?.cancel().catch(() => undefined)
    throw new Error(`Public delivery verification failed with status ${response.status}`)
  }
  if ((await response.arrayBuffer()).byteLength === 0) throw new Error('Public delivery verification returned an empty image')
}

async function verifySourceReplacement(
  supabase: SupabaseClient<Database>,
  s3: S3Client,
  candidate: SourceReplacement,
  cdnUrl: string,
  dryRun: boolean,
): Promise<Record<string, unknown>> {
  const jobs = await supabase.from('media_deletion_jobs').select(
    'id,image_id,bucket,object_key,reason,status,delivery_verified_at',
  ).eq('id', candidate.jobId).limit(1)
  if (jobs.error) throw jobs.error
  const job = jobs.data?.[0]
  if (!job || job.image_id !== candidate.imageId || job.bucket !== BUCKET
    || job.object_key !== candidate.objectKey || job.reason !== 'source_replaced'
    || job.status !== 'queued' || job.delivery_verified_at !== null) {
    throw new Error(`Source-replacement job changed after reviewed health artifact: ${candidate.jobId}`)
  }
  const images = await supabase.from('images').select(
    'id,status,visibility,processing_status,moderation_status,original_bucket,original_key,optimized_bucket,optimized_key,optimized_mime,storage_bucket,storage_path,url,asset_version',
  ).eq('id', candidate.imageId).limit(1)
  if (images.error) throw images.error
  const image = images.data?.[0]
  if (!image || image.status !== 'approved' || image.visibility !== 'public'
    || image.processing_status !== 'ready' || !['approved', 'skipped'].includes(image.moderation_status ?? '')
    || image.original_bucket !== BUCKET || image.original_key !== candidate.objectKey
    || image.optimized_bucket !== BUCKET || typeof image.optimized_key !== 'string'
    || image.optimized_mime !== 'image/webp' || image.storage_bucket !== BUCKET
    || image.storage_path !== image.optimized_key) {
    throw new Error(`Canonical image changed after reviewed health artifact: ${candidate.imageId}`)
  }
  const original = await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: candidate.objectKey }))
  const canonical = await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: image.optimized_key }))
  if (!original.ContentLength || !canonical.ContentLength
    || canonical.ContentType?.split(';', 1)[0]?.trim().toLowerCase() !== 'image/webp') {
    throw new Error(`Source replacement objects failed verification: ${candidate.jobId}`)
  }
  const urls = new Set<string>([
    `${cdnUrl}/${encodeObjectPath(image.optimized_key)}?variant=detail&format=webp`,
    `${cdnUrl}/images/${encodeURIComponent(candidate.imageId)}/v${image.asset_version}/detail.webp`,
    `${cdnUrl}/images/${encodeURIComponent(candidate.imageId)}/v${image.asset_version}/topo.webp`,
  ])
  if (typeof image.url === 'string') {
    const match = /^private:\/\/[^/]+\/(.+)$/.exec(image.url)
    urls.add(match ? `${cdnUrl}/${encodeObjectPath(match[1])}?variant=detail&format=webp` : new URL(image.url, cdnUrl).toString())
  }
  for (const url of urls) await requirePublicImage(url)
  if (!dryRun) {
    const verified = await supabase.rpc('verify_media_replacement_delivery', {
      p_job_id: candidate.jobId, p_expected_optimized_key: image.optimized_key,
    })
    if (verified.error) throw verified.error
  }
  return { ...candidate, canonicalKey: image.optimized_key, action: dryRun ? 'validated' : 'delivery_verified' }
}

async function loadCurrentMissingReferences(
  supabase: SupabaseClient<Database>,
  reviewed: Array<Omit<MissingReference, 'status' | 'processingStatus'>>,
): Promise<MissingReference[]> {
  const images = reviewed.filter((item) => item.kind === 'image')
  const drafts = reviewed.filter((item) => item.kind === 'draft_image')
  const result: MissingReference[] = []
  if (images.length) {
    const response = await supabase.from('images').select(
      'id,status,processing_status,storage_provider,storage_bucket,storage_path,original_bucket,original_key,optimized_bucket,optimized_key',
    ).in('id', images.map((item) => item.id))
    if (response.error) throw response.error
    const byId = new Map((response.data ?? []).map((row) => [row.id, row]))
    for (const item of images) {
      const row = byId.get(item.id)
      if (!row || row.storage_provider !== 'r2' || row.storage_bucket !== BUCKET
        || row.storage_path !== item.objectKey || row.original_bucket !== BUCKET
        || row.original_key !== item.objectKey || row.optimized_bucket !== null || row.optimized_key !== null) {
        throw new Error(`Image changed after reviewed health artifact: ${item.id}`)
      }
      result.push({ ...item, status: row.status, processingStatus: row.processing_status })
    }
  }
  if (drafts.length) {
    const response = await supabase.from('submission_draft_images').select(
      'id,draft_id,processing_status,storage_provider,storage_bucket,storage_path,submission_drafts!inner(status)',
    ).in('id', drafts.map((item) => item.id))
    if (response.error) throw response.error
    const byId = new Map((response.data ?? []).map((row) => [row.id, row]))
    for (const item of drafts) {
      const row = byId.get(item.id)
      const parent = row?.submission_drafts as unknown
      const status = isRecord(parent) && typeof parent.status === 'string' ? parent.status : null
      if (!row || status !== 'draft' || row.storage_provider !== 'r2'
        || row.storage_bucket !== BUCKET || row.storage_path !== item.objectKey) {
        throw new Error(`Draft image changed after reviewed health artifact: ${item.id}`)
      }
      result.push({ ...item, status, processingStatus: row.processing_status })
    }
  }
  return result.sort((a, b) => `${a.kind}:${a.id}`.localeCompare(`${b.kind}:${b.id}`, 'en'))
}

async function main(): Promise<void> {
  const output = process.env.REMEDIATION_OUTPUT?.trim() || 'production-media-remediation.json'
  const manifest: Record<string, unknown> = { schemaVersion: 1, dryRun: true, kind: null, selected: [], actions: [] }
  let s3: S3Client | null = null
  try {
    if (requiredEnv('CONFIRMATION') !== 'REMEDIATE_MEDIA') throw new Error('CONFIRMATION must equal REMEDIATE_MEDIA')
    const dryRun = parseBoolean(requiredEnv('DRY_RUN'))
    const kind = requiredEnv('REMEDIATION_KIND')
    const batchSize = parseBatchSize(requiredEnv('BATCH_SIZE'))
    const sourceRunId = requiredEnv('SOURCE_RUN_ID')
    const digest = requiredEnv('ARTIFACT_DIGEST')
    if (!/^\d+$/.test(sourceRunId) || !/^sha256:[0-9a-f]{64}$/.test(digest)) throw new Error('Invalid artifact provenance')
    const artifact = JSON.parse(await readFile(requiredEnv('LIFECYCLE_HEALTH_INPUT'), 'utf8')) as unknown
    const supabase = createClient<Database>(requiredEnv('SUPABASE_URL'), requiredEnv('SUPABASE_SERVICE_ROLE_KEY'), {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    s3 = new S3Client({
      region: 'auto', endpoint: requiredEnv('R2_ENDPOINT'),
      credentials: { accessKeyId: requiredEnv('R2_ACCESS_KEY_ID'), secretAccessKey: requiredEnv('R2_SECRET_ACCESS_KEY') },
    })
    Object.assign(manifest, { dryRun, kind, sourceRunId, artifactDigest: digest })

    if (kind === 'missing_reference') {
      const reviewed = [...parseMissingImages(artifact), ...parseMissingDrafts(artifact)]
        .sort((a, b) => `${a.kind}:${a.id}`.localeCompare(`${b.kind}:${b.id}`, 'en')).slice(0, batchSize)
      if (!reviewed.length) throw new Error('Artifact has no missing references to remediate')
      const selected = await loadCurrentMissingReferences(supabase, reviewed)
      for (const item of selected) await requireMissing(s3, item)
      manifest.selected = selected
      if (!dryRun) {
        const response = await supabase.rpc('quarantine_missing_media_references', {
          p_items: selected, p_source_run_id: Number(sourceRunId), p_artifact_digest: digest,
        })
        if (response.error) throw response.error
        manifest.actions = response.data ?? []
      }
    } else if (kind === 'source_replacement') {
      const selected = parseSourceReplacements(artifact)
        .sort((a, b) => a.jobId.localeCompare(b.jobId, 'en')).slice(0, batchSize)
      if (!selected.length) throw new Error('Artifact has no source replacements to verify')
      manifest.selected = selected
      const cdnUrl = requiredEnv('MEDIA_CDN_URL').replace(/\/$/, '')
      if (new URL(cdnUrl).protocol !== 'https:') throw new Error('MEDIA_CDN_URL must use HTTPS')
      for (const item of selected) {
        ;(manifest.actions as unknown[]).push(await verifySourceReplacement(supabase, s3, item, cdnUrl, dryRun))
      }
    } else if (kind === 'possible_orphan') {
      const selected = parseOrphans(artifact).sort((a, b) => a.key.localeCompare(b.key, 'en')).slice(0, batchSize)
      if (!selected.length) throw new Error('Artifact has no possible orphans to remediate')
      for (const item of selected) await requireMatchingOrphan(s3, item)
      manifest.selected = selected
      if (!dryRun) {
        const response = await supabase.rpc('enqueue_reconciled_media_orphans', {
          p_bucket: BUCKET, p_keys: selected.map((item) => item.key),
          p_expected_etags: selected.map((item) => item.etag),
          p_expected_bytes: selected.map((item) => item.size),
          p_reconciliation_run_id: Number(sourceRunId), p_artifact_digest: digest,
        })
        if (response.error) throw response.error
        manifest.actions = response.data ?? []
      }
    } else {
      throw new Error('REMEDIATION_KIND must be missing_reference, source_replacement, or possible_orphan')
    }
  } catch (error) {
    manifest.fatalError = error instanceof Error ? error.message.replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 2_000) : 'Unknown remediation error'
    process.exitCode = 1
  } finally {
    s3?.destroy()
    await writeFile(output, `${JSON.stringify(manifest, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
    console.log(JSON.stringify({ dryRun: manifest.dryRun, kind: manifest.kind,
      selected: (manifest.selected as unknown[]).length, actions: (manifest.actions as unknown[]).length,
      fatalError: manifest.fatalError }))
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) void main()
