import { readFile, writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

import pLimit from 'p-limit'
import { Client, type QueryResultRow } from 'pg'

const OUTPUT_PATH = process.env.MEDIA_HEALTH_OUTPUT?.trim() || 'production-media-http-health.json'
const BASELINE_PATH = process.env.MEDIA_HEALTH_BASELINE?.trim() || null
const REQUEST_TIMEOUT_MS = 30_000
const CONCURRENCY = 8

export type MediaSurface = {
  surface: 'images.url' | 'images.identity.detail' | 'images.identity.topo' | 'crag_images.url'
  sourceId: string
  imageId: string
  cragId: string | null
  requestedUrl: string
}

export type HealthEntry = MediaSurface & {
  finalUrl: string | null
  status: number | null
  mime: string | null
  byteCount: number
  error: string | null
  failure: 'new' | 'existing' | null
}

type ImageRow = QueryResultRow & { id: string; url: string; asset_version: number; crag_id: string | null }
type CragImageRow = QueryResultRow & {
  id: string
  crag_id: string
  image_id: string
  url: string
}

type Manifest = {
  schemaVersion: 1
  entries: HealthEntry[]
  summary: { checked: number; passed: number; existingFailures: number; newFailures: number }
  fatalError?: string
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : 'Unknown HTTP verification error'
  return message.replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 2_000)
}

function normalizedMime(value: string | null): string | null {
  return value?.split(';', 1)[0]?.trim().toLowerCase() || null
}

function encodeObjectPath(key: string): string {
  return key.split('/').filter(Boolean).map(encodeURIComponent).join('/')
}

export function resolveMediaUrl(value: string, cdnUrl: string): string {
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

export function failureKey(entry: Pick<HealthEntry, 'surface' | 'sourceId' | 'requestedUrl'>): string {
  return `${entry.surface}\u0000${entry.sourceId}\u0000${entry.requestedUrl}`
}

function compareEntries(left: Pick<HealthEntry, 'surface' | 'sourceId' | 'requestedUrl'>, right: Pick<HealthEntry, 'surface' | 'sourceId' | 'requestedUrl'>): number {
  const leftKey = failureKey(left)
  const rightKey = failureKey(right)
  return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0
}

export function baselineFailureKeys(value: unknown): Set<string> {
  if (!isRecord(value) || value.schemaVersion !== 1 || !Array.isArray(value.entries)) {
    throw new Error('Baseline manifest has an invalid schema')
  }
  const keys = new Set<string>()
  for (const entry of value.entries) {
    if (!isRecord(entry) || typeof entry.surface !== 'string' || typeof entry.sourceId !== 'string'
      || typeof entry.requestedUrl !== 'string' || !('error' in entry)) {
      throw new Error('Baseline manifest contains an invalid entry')
    }
    if (entry.error !== null) keys.add(`${entry.surface}\u0000${entry.sourceId}\u0000${entry.requestedUrl}`)
  }
  return keys
}

async function readSurfaces(cdnUrl: string): Promise<MediaSurface[]> {
  const client = new Client(databaseConfig())
  await client.connect()
  try {
    await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY')
    const images = await client.query<ImageRow>(`
      SELECT i.id, i.url, i.asset_version, i.crag_id
      FROM public.images i
      LEFT JOIN public.crags c ON c.id = i.crag_id
      WHERE i.status = 'approved' AND i.processing_status = 'ready'
        AND i.visibility = 'public' AND i.moderation_status IN ('approved', 'skipped')
        AND (i.crag_id IS NULL OR c.deleted_at IS NULL)
      ORDER BY i.id`)
    const cragImages = await client.query<CragImageRow>(`
      SELECT ci.id, ci.crag_id, COALESCE(ci.linked_image_id, ci.source_image_id) AS image_id, ci.url
      FROM public.crag_images ci
      JOIN public.crags c ON c.id = ci.crag_id AND c.deleted_at IS NULL
       WHERE (ci.linked_image_id IS NOT NULL OR ci.source_image_id IS NOT NULL)
       ORDER BY ci.id`)
    await client.query('COMMIT')

    const surfaces: MediaSurface[] = []
    for (const image of images.rows) {
      surfaces.push({
        surface: 'images.url', sourceId: image.id, imageId: image.id, cragId: image.crag_id,
        requestedUrl: resolveMediaUrl(image.url, cdnUrl),
      })
      for (const variant of ['detail', 'topo'] as const) {
        surfaces.push({
          surface: `images.identity.${variant}`, sourceId: image.id, imageId: image.id, cragId: image.crag_id,
          requestedUrl: `${cdnUrl}/images/${encodeURIComponent(image.id)}/v${image.asset_version}/${variant}.webp`,
        })
      }
    }
    for (const image of cragImages.rows) {
      surfaces.push({
        surface: 'crag_images.url', sourceId: image.id, imageId: image.image_id, cragId: image.crag_id,
        requestedUrl: resolveMediaUrl(image.url, cdnUrl),
      })
    }
    return surfaces.sort(compareEntries)
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally {
    await client.end()
  }
}

export async function verifySurface(
  surface: MediaSurface,
  fetcher: typeof fetch = fetch,
): Promise<Omit<HealthEntry, 'failure'>> {
  try {
    const fetchUrl = new URL(surface.requestedUrl)
    fetchUrl.searchParams.set('width', `health-${Date.now()}-${Math.random().toString(16).slice(2)}`)
    const response = await fetcher(fetchUrl, {
      method: 'GET',
      redirect: 'follow',
      headers: { 'Cache-Control': 'no-cache' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    const mime = normalizedMime(response.headers.get('content-type'))
    const bytes = await response.arrayBuffer()
    let error: string | null = null
    if (response.status !== 200) error = `Expected final HTTP 200, received ${response.status}`
    else if (!mime?.startsWith('image/')) error = `Expected image/* Content-Type, received ${mime ?? 'missing'}`
    else if (bytes.byteLength === 0) error = 'Response body is empty'
    return {
      ...surface,
      finalUrl: response.url || surface.requestedUrl,
      status: response.status,
      mime,
      byteCount: bytes.byteLength,
      error,
    }
  } catch (error) {
    return { ...surface, finalUrl: null, status: null, mime: null, byteCount: 0, error: errorMessage(error) }
  }
}

export function createManifest(
  results: Array<Omit<HealthEntry, 'failure'>>,
  baselineFailures: ReadonlySet<string>,
): Manifest {
  const entries = results.map((entry): HealthEntry => ({
    ...entry,
    failure: entry.error === null ? null : baselineFailures.has(failureKey(entry)) ? 'existing' : 'new',
  })).sort(compareEntries)
  const existingFailures = entries.filter((entry) => entry.failure === 'existing').length
  const newFailures = entries.filter((entry) => entry.failure === 'new').length
  return {
    schemaVersion: 1,
    entries,
    summary: { checked: entries.length, passed: entries.length - existingFailures - newFailures, existingFailures, newFailures },
  }
}

async function main(): Promise<void> {
  try {
    const cdnUrl = requiredEnv('MEDIA_CDN_URL').replace(/\/$/, '')
    if (new URL(cdnUrl).protocol !== 'https:') throw new Error('MEDIA_CDN_URL must use HTTPS')
    const surfaces = await readSurfaces(cdnUrl)
    const limit = pLimit(CONCURRENCY)
    const results = await Promise.all(surfaces.map((surface) => limit(() => verifySurface(surface))))
    const baseline = BASELINE_PATH
      ? baselineFailureKeys(JSON.parse(await readFile(BASELINE_PATH, 'utf8')) as unknown)
      : new Set(results.filter((entry) => entry.error !== null).map(failureKey))
    const manifest = createManifest(results, baseline)
    await writeFile(OUTPUT_PATH, `${JSON.stringify(manifest, null, 2)}\n`)
    console.log(`Checked ${manifest.summary.checked} URLs: ${manifest.summary.newFailures} new, ${manifest.summary.existingFailures} existing failures`)
    if (manifest.summary.newFailures > 0) process.exitCode = 1
  } catch (error) {
    const fatalError = errorMessage(error)
    const manifest: Manifest = {
      schemaVersion: 1,
      entries: [],
      summary: { checked: 0, passed: 0, existingFailures: 0, newFailures: 1 },
      fatalError,
    }
    await writeFile(OUTPUT_PATH, `${JSON.stringify(manifest, null, 2)}\n`)
    console.error(fatalError)
    process.exitCode = 1
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) void main()
