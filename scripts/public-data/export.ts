import { spawn } from 'node:child_process'
import { createReadStream } from 'node:fs'
import { chmod, mkdtemp, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import {
  HeadObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
  type HeadObjectCommandOutput,
} from '@aws-sdk/client-s3'
import { Client, types as pgTypes, type QueryResult, type QueryResultRow } from 'pg'

import { type ArtifactMetadata, sha256File, writeGeoJsonGzip, writeJsonlGzip } from '@/scripts/public-data/io'
import { cragToGeoJsonFeature, isRecord, serializeViewRow, type ExportView, type JsonObject } from '@/scripts/public-data/serialize'

const PAGE_SIZE = 1_000
const SNAPSHOT_ROOT = 'v1/snapshots'
const IMMUTABLE_CACHE = 'public, max-age=31536000, immutable'
const LATEST_CACHE = 'public, max-age=300, must-revalidate'

type ExportConfig = {
  databaseUrl: string
  endpoint: string
  bucket: string
  accessKeyId: string
  secretAccessKey: string
  publicBaseUrl: string
  minisignPrivateKey: string
  minisignPublicKey: string
  exportDate: string
  sourceRevision: string
  generatedAt: string
  runId: string
}

type Manifest = {
  schema_version: '1.0.0'
  generated_at: string
  snapshot_id: string
  snapshot_type: 'full'
  run_id: string
  source_revision: string
  license: 'ODbL-1.0'
  coordinate_reference_system: 'EPSG:4326'
  coordinate_order: 'lon-lat'
  location_policy: string
  signature: {
    algorithm: 'minisign'
    public_key_path: 'v1/minisign.pub'
  }
  files: ArtifactMetadata[]
}

type LocalArtifact = ArtifactMetadata & { localPath: string }
type Environment = Record<string, string | undefined>

const VIEW_FILES: Array<{ view: ExportView; file: string; mediaType: string }> = [
  { view: 'crags', file: 'crags.jsonl.gz', mediaType: 'application/x-ndjson' },
  { view: 'routes', file: 'routes.jsonl.gz', mediaType: 'application/x-ndjson' },
  { view: 'route_lines', file: 'route-lines.jsonl.gz', mediaType: 'application/x-ndjson' },
  { view: 'sectors', file: 'sectors.jsonl.gz', mediaType: 'application/x-ndjson' },
  { view: 'tombstones', file: 'tombstones.jsonl.gz', mediaType: 'application/x-ndjson' },
]

function requiredEnv(env: Environment, name: string): string {
  const value = env[name]
  if (!value?.trim()) throw new Error(`${name} is required`)
  return value
}

export function loadConfig(env: Environment = process.env, now = new Date()): ExportConfig {
  const exportDate = env.EXPORT_DATE?.trim() || now.toISOString().slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(exportDate) || new Date(`${exportDate}T00:00:00Z`).toISOString().slice(0, 10) !== exportDate) {
    throw new Error('EXPORT_DATE must be a valid YYYY-MM-DD date')
  }
  const publicBaseUrl = requiredEnv(env, 'OPEN_DATA_PUBLIC_BASE_URL').replace(/\/+$/, '')
  const parsedBaseUrl = new URL(publicBaseUrl)
  if (!['http:', 'https:'].includes(parsedBaseUrl.protocol)) throw new Error('OPEN_DATA_PUBLIC_BASE_URL must be HTTP(S)')

  return {
    databaseUrl: requiredEnv(env, 'PUBLIC_DATA_EXPORT_DATABASE_URL'),
    endpoint: requiredEnv(env, 'OPEN_DATA_R2_ENDPOINT'),
    bucket: requiredEnv(env, 'OPEN_DATA_R2_BUCKET'),
    accessKeyId: requiredEnv(env, 'OPEN_DATA_R2_ACCESS_KEY_ID'),
    secretAccessKey: requiredEnv(env, 'OPEN_DATA_R2_SECRET_ACCESS_KEY'),
    publicBaseUrl,
    minisignPrivateKey: requiredEnv(env, 'OPEN_DATA_MINISIGN_PRIVATE_KEY'),
    minisignPublicKey: requiredEnv(env, 'OPEN_DATA_MINISIGN_PUBLIC_KEY'),
    exportDate,
    sourceRevision: env.GITHUB_SHA?.trim() || 'unknown',
    generatedAt: now.toISOString(),
    runId: `${now.toISOString().replace(/[-:.]/g, '')}-${(env.GITHUB_SHA?.trim() || 'local').slice(0, 12)}`,
  }
}

function rowKey(row: unknown, key: string, label: string): string {
  if (!isRecord(row) || typeof row[key] !== 'string') throw new Error(`${label}.${key} must be a string`)
  return row[key]
}

export async function* keysetRows(client: Client, view: ExportView, pageSize = PAGE_SIZE): AsyncGenerator<unknown> {
  if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 10_000) throw new Error('Invalid page size')
  let cursor: string | null = null
  let entityCursor: string | null = null

  while (true) {
    let result: QueryResult<QueryResultRow>
    if (view === 'tombstones') {
      result = entityCursor === null
        ? await client.query('SELECT * FROM public.public_data_export_tombstones_v1 ORDER BY entity_type, id LIMIT $1', [pageSize])
        : await client.query('SELECT * FROM public.public_data_export_tombstones_v1 WHERE (entity_type, id) > ($1, $2) ORDER BY entity_type, id LIMIT $3', [entityCursor, cursor, pageSize])
    } else {
      const viewName: Record<Exclude<ExportView, 'tombstones'>, string> = {
        crags: 'public.public_data_export_crags_v1',
        routes: 'public.public_data_export_routes_v1',
        route_lines: 'public.public_data_export_route_lines_v1',
        sectors: 'public.public_data_export_sectors_v1',
      }
      result = cursor === null
        ? await client.query(`SELECT * FROM ${viewName[view]} ORDER BY id LIMIT $1`, [pageSize])
        : await client.query(`SELECT * FROM ${viewName[view]} WHERE id > $1 ORDER BY id LIMIT $2`, [cursor, pageSize])
    }

    for (const row of result.rows) yield row
    if (result.rows.length < pageSize) return
    const last = result.rows[result.rows.length - 1]
    cursor = rowKey(last, 'id', view)
    if (view === 'tombstones') entityCursor = rowKey(last, 'entity_type', view)
  }
}

export function createManifest(
  config: Pick<ExportConfig, 'generatedAt' | 'exportDate' | 'sourceRevision' | 'runId'>,
  files: ArtifactMetadata[],
): Manifest {
  return {
    schema_version: '1.0.0',
    generated_at: config.generatedAt,
    snapshot_id: config.exportDate,
    snapshot_type: 'full',
    run_id: config.runId,
    source_revision: config.sourceRevision,
    license: 'ODbL-1.0',
    coordinate_reference_system: 'EPSG:4326',
    coordinate_order: 'lon-lat',
    location_policy: 'Per-record location_visibility: exact coordinates are retained, approximate crags are rounded to 2 decimals, hidden coordinates are null, and routes apply the stricter route/crag policy.',
    signature: { algorithm: 'minisign', public_key_path: 'v1/minisign.pub' },
    files,
  }
}

export function deterministicJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`
}

async function runMinisign(args: string[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn('minisign', args, { shell: false, stdio: ['ignore', 'inherit', 'inherit'] })
    child.once('error', reject)
    child.once('exit', (code, signal) => {
      if (code === 0) resolve()
      else reject(new Error(`minisign failed (${signal ?? `exit ${code}`})`))
    })
  })
}

async function signManifest(
  manifestPath: string,
  privateKey: string,
  publicKey: string,
  directory: string,
): Promise<string> {
  const keyPath = join(directory, 'minisign.key')
  const publicKeyPath = join(directory, 'minisign.pub')
  const signaturePath = `${manifestPath}.minisig`
  await writeFile(keyPath, privateKey, { encoding: 'utf8', mode: 0o600, flag: 'wx' })
  await writeFile(publicKeyPath, publicKey, { encoding: 'utf8', flag: 'wx' })
  await chmod(keyPath, 0o600)
  await runMinisign(['-S', '-s', keyPath, '-m', manifestPath, '-x', signaturePath])
  await runMinisign(['-V', '-p', publicKeyPath, '-m', manifestPath, '-x', signaturePath])
  await rm(keyPath, { force: true })
  return signaturePath
}

function isNotFound(error: unknown): boolean {
  if (!isRecord(error)) return false
  return error.name === 'NotFound' || error.name === 'NoSuchKey'
    || (isRecord(error.$metadata) && error.$metadata.httpStatusCode === 404)
}

async function headOrNull(s3: S3Client, bucket: string, key: string): Promise<HeadObjectCommandOutput | null> {
  try {
    return await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }))
  } catch (error) {
    if (isNotFound(error)) return null
    throw error
  }
}

async function getObjectText(s3: S3Client, bucket: string, key: string): Promise<string> {
  const result = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }))
  if (!result.Body) throw new Error(`Object s3://${bucket}/${key} has no body`)
  return result.Body.transformToString('utf8')
}

async function assertAbsent(s3: S3Client, bucket: string, keys: string[]) {
  for (const key of keys) {
    if (await headOrNull(s3, bucket, key)) throw new Error(`Refusing to overwrite immutable object s3://${bucket}/${key}`)
  }
}

async function uploadFile(
  s3: S3Client,
  bucket: string,
  key: string,
  localPath: string,
  contentType: string,
  cacheControl: string,
  metadata: Record<string, string>,
  immutable: boolean,
) {
  const size = (await stat(localPath)).size
  await s3.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: createReadStream(localPath),
    ContentLength: size,
    ContentType: contentType,
    ContentEncoding: key.endsWith('.gz') ? 'gzip' : undefined,
    CacheControl: cacheControl,
    Metadata: metadata,
    IfNoneMatch: immutable ? '*' : undefined,
  }))
  const head = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }))
  if (head.ContentLength !== size) throw new Error(`Uploaded length mismatch for ${key}`)
}

async function uploadImmutableSet(s3: S3Client, config: ExportConfig, prefix: string, artifacts: LocalArtifact[]) {
  const keys = artifacts.map((artifact) => `${prefix}/${artifact.path}`)
  await assertAbsent(s3, config.bucket, keys)
  for (const artifact of artifacts) {
    await uploadFile(s3, config.bucket, `${prefix}/${artifact.path}`, artifact.localPath, artifact.media_type,
      IMMUTABLE_CACHE, { 'snapshot-id': config.exportDate, sha256: artifact.sha256 }, true)
  }
}

async function ensurePublicKey(s3: S3Client, config: ExportConfig, directory: string): Promise<void> {
  const localPath = join(directory, 'minisign.pub')
  const expected = config.minisignPublicKey.endsWith('\n')
    ? config.minisignPublicKey
    : `${config.minisignPublicKey}\n`
  await writeFile(localPath, expected, { encoding: 'utf8', flag: 'w' })
  const existing = await headOrNull(s3, config.bucket, 'v1/minisign.pub')
  if (existing) {
    if (await getObjectText(s3, config.bucket, 'v1/minisign.pub') !== expected) {
      throw new Error('Published Minisign public key does not match configured signing key')
    }
    return
  }
  await uploadFile(s3, config.bucket, 'v1/minisign.pub', localPath, 'text/plain; charset=utf-8',
    IMMUTABLE_CACHE, {}, true)
}

function discoveryDocument(config: ExportConfig, prefix: string, manifest: LocalArtifact): JsonObject {
  const manifestPath = `${prefix}/manifest.json`
  const signaturePath = `${prefix}/manifest.json.minisig`
  return {
    schema_version: '1.0.0',
    generated_at: config.generatedAt,
    snapshot_id: config.exportDate,
    run_id: config.runId,
    manifest_url: `${config.publicBaseUrl}/${manifestPath}`,
    manifest_path: manifestPath,
    manifest_sha256: manifest.sha256,
    signature_url: `${config.publicBaseUrl}/${signaturePath}`,
    signature_path: signaturePath,
    manifest: { path: manifestPath, url: `${config.publicBaseUrl}/${manifestPath}`, sha256: manifest.sha256 },
    signature: { path: signaturePath, url: `${config.publicBaseUrl}/${signaturePath}` },
  }
}

async function writeAnnualIfAbsent(
  s3: S3Client,
  config: ExportConfig,
  artifacts: LocalArtifact[],
  manifest: LocalArtifact,
  directory: string,
): Promise<void> {
  const annualRoot = `v1/annual/${config.exportDate.slice(0, 4)}`
  if (await headOrNull(s3, config.bucket, `${annualRoot}/latest.json`)) return
  const annualPrefix = `${annualRoot}/${config.runId}`
  await uploadImmutableSet(s3, config, annualPrefix, artifacts)
  const pointerPath = join(directory, 'annual-latest.json')
  await writeFile(pointerPath, deterministicJson(discoveryDocument(config, annualPrefix, manifest)), {
    encoding: 'utf8', flag: 'wx',
  })
  await uploadFile(s3, config.bucket, `${annualRoot}/latest.json`, pointerPath, 'application/json',
    IMMUTABLE_CACHE, { 'snapshot-id': config.exportDate }, true)
}

async function shouldAdvanceLatest(s3: S3Client, config: ExportConfig): Promise<boolean> {
  const existing = await headOrNull(s3, config.bucket, 'v1/latest.json')
  if (!existing) return true
  const value: unknown = JSON.parse(await getObjectText(s3, config.bucket, 'v1/latest.json'))
  if (!isRecord(value) || typeof value.snapshot_id !== 'string'
    || !/^\d{4}-\d{2}-\d{2}$/.test(value.snapshot_id)) {
    throw new Error('Published latest.json has an invalid snapshot_id')
  }
  return value.snapshot_id <= config.exportDate
}

async function buildArtifacts(client: Client, config: ExportConfig, directory: string): Promise<LocalArtifact[]> {
  const artifacts: LocalArtifact[] = []
  for (const definition of VIEW_FILES) {
    const localPath = join(directory, definition.file)
    const metadata = await writeJsonlGzip(localPath, keysetRows(client, definition.view), (row) => serializeViewRow(definition.view, row))
    artifacts.push({ ...metadata, path: definition.file, media_type: definition.mediaType, localPath })
  }

  const geoJsonPath = join(directory, 'crags.geojson.gz')
  const geoJsonMetadata = await writeGeoJsonGzip(geoJsonPath, keysetRows(client, 'crags'), cragToGeoJsonFeature)
  artifacts.push({ ...geoJsonMetadata, path: 'crags.geojson.gz', media_type: 'application/geo+json', localPath: geoJsonPath })

  const manifestPath = join(directory, 'manifest.json')
  const manifestFiles = artifacts.map((artifact) => ({
    path: artifact.path,
    media_type: artifact.media_type,
    compression: artifact.compression,
    rows: artifact.rows,
    bytes: artifact.bytes,
    sha256: artifact.sha256,
  }))
  await writeFile(manifestPath, deterministicJson(createManifest(config, manifestFiles)), { encoding: 'utf8', flag: 'wx' })
  const manifestMetadata = await sha256File(manifestPath)
  artifacts.push({ ...manifestMetadata, path: 'manifest.json', media_type: 'application/json', compression: 'none', rows: manifestFiles.length, localPath: manifestPath })

  const signaturePath = await signManifest(
    manifestPath,
    config.minisignPrivateKey,
    config.minisignPublicKey,
    directory,
  )
  const signatureMetadata = await sha256File(signaturePath)
  artifacts.push({ ...signatureMetadata, path: 'manifest.json.minisig', media_type: 'application/minisign', compression: 'none', rows: 1, localPath: signaturePath })
  return artifacts
}

export async function runExport(env: Environment = process.env): Promise<void> {
  const config = loadConfig(env)
  const directory = await mkdtemp(join(tmpdir(), 'public-data-export-'))
  pgTypes.setTypeParser(1082, (value) => value)
  pgTypes.setTypeParser(1114, (value) => value)
  pgTypes.setTypeParser(1184, (value) => value)
  pgTypes.setTypeParser(1700, (value) => Number(value))
  const client = new Client({ connectionString: config.databaseUrl })
  const s3 = new S3Client({
    region: 'auto',
    endpoint: config.endpoint,
    forcePathStyle: true,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
  })

  try {
    await client.connect()
    await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY')
    await client.query('SET ROLE public_data_export_reader')
    const roleResult = await client.query<{ current_role: string }>('SELECT current_role')
    if (roleResult.rows[0]?.current_role !== 'public_data_export_reader') throw new Error('Failed to assume public_data_export_reader')

    const artifacts = await buildArtifacts(client, config, directory)
    await client.query('COMMIT')

    await ensurePublicKey(s3, config, directory)
    const snapshotPrefix = `${SNAPSHOT_ROOT}/${config.exportDate}/${config.runId}`
    await uploadImmutableSet(s3, config, snapshotPrefix, artifacts)

    const manifest = artifacts.find((artifact) => artifact.path === 'manifest.json')
    if (!manifest) throw new Error('Manifest artifact is missing')
    await writeAnnualIfAbsent(s3, config, artifacts, manifest, directory)
    const latest = discoveryDocument(config, snapshotPrefix, manifest)
    if (await shouldAdvanceLatest(s3, config)) {
      const latestPath = join(directory, 'latest.json')
      await writeFile(latestPath, deterministicJson(latest), { encoding: 'utf8', flag: 'wx' })
      await uploadFile(s3, config.bucket, 'v1/latest.json', latestPath, 'application/json', LATEST_CACHE,
        { 'snapshot-id': config.exportDate }, false)
    }
  } catch (error) {
    try {
      await client.query('ROLLBACK')
    } catch {
      // The connection may not have opened or the transaction may already be closed.
    }
    throw error
  } finally {
    await client.end().catch(() => undefined)
    s3.destroy()
    await rm(directory, { recursive: true, force: true })
  }
}

function isDirectExecution(): boolean {
  const entry = process.argv[1]
  return Boolean(entry && import.meta.url === pathToFileURL(resolve(entry)).href)
}

if (isDirectExecution()) {
  runExport().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)
    process.stderr.write(`Public data export failed: ${message}\n`)
    process.exitCode = 1
  })
}
