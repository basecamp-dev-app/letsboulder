import { createClient } from '@supabase/supabase-js'

const DEFAULT_LIMIT = 100
const DEFAULT_PAGE_SIZE = 200
const ACTIVE_JOB_STATUSES = ['queued', 'processing']

function getRequiredEnv(name) {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }

  return value
}

function parseArgs(argv) {
  const options = {
    dryRun: false,
    limit: DEFAULT_LIMIT,
    pageSize: DEFAULT_PAGE_SIZE,
  }

  for (const arg of argv) {
    if (arg === '--dry-run') {
      options.dryRun = true
      continue
    }

    if (arg.startsWith('--limit=')) {
      options.limit = Number.parseInt(arg.slice('--limit='.length), 10)
      continue
    }

    if (arg.startsWith('--page-size=')) {
      options.pageSize = Number.parseInt(arg.slice('--page-size='.length), 10)
    }
  }

  if (!Number.isFinite(options.limit) || options.limit <= 0) {
    throw new Error('Expected --limit to be a positive integer')
  }

  if (!Number.isFinite(options.pageSize) || options.pageSize <= 0) {
    throw new Error('Expected --page-size to be a positive integer')
  }

  return options
}

function isNonEmptyObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length > 0
}

function isImageBackfilled(row, privateBucket) {
  const canonicalOriginal = row.original_bucket === privateBucket && typeof row.original_key === 'string' && row.original_key.length > 0
  const onR2 = row.storage_provider === 'r2'
  const ready = row.processing_status === 'ready'

  if (row.moderation_status === 'approved' || row.moderation_status === 'skipped') {
    return onR2 && canonicalOriginal && row.visibility === 'public' && ready && isNonEmptyObject(row.variants)
  }

  return onR2 && canonicalOriginal && ready
}

function buildPayload(row) {
  const originalBucket = row.original_bucket || row.storage_bucket
  const originalKey = row.original_key || row.storage_path

  if (!originalBucket || !originalKey) {
    return null
  }

  return {
    image_id: row.id,
    job_type: 'ingest_image',
    status: 'queued',
    payload: {
      imageId: row.id,
      originalBucket,
      originalKey,
      storageProvider: row.storage_provider === 'r2' ? 'r2' : 'supabase',
      purpose: 'submission_image',
      triggeredByUserId: row.created_by || 'system-backfill',
      trigger: 'backfill',
    },
  }
}

async function fetchActiveJobIds(supabase, imageIds) {
  if (imageIds.length === 0) {
    return new Set()
  }

  const { data, error } = await supabase
    .from('media_jobs')
    .select('image_id')
    .in('image_id', imageIds)
    .in('status', ACTIVE_JOB_STATUSES)

  if (error) {
    throw error
  }

  return new Set((data || []).map((row) => row.image_id).filter((value) => typeof value === 'string'))
}

async function collectCandidates(supabase, options, privateBucket) {
  const candidates = []
  let offset = 0

  while (candidates.length < options.limit) {
    const upperBound = offset + options.pageSize - 1
    const { data, error } = await supabase
      .from('images')
      .select('id, created_by, status, moderation_status, storage_provider, storage_bucket, storage_path, original_bucket, original_key, visibility, processing_status, variants')
      .neq('status', 'deleted')
      .order('created_at', { ascending: true })
      .range(offset, upperBound)

    if (error) {
      throw error
    }

    const rows = data || []
    if (rows.length === 0) {
      break
    }

    const activeJobIds = await fetchActiveJobIds(supabase, rows.map((row) => row.id))

    for (const row of rows) {
      if (activeJobIds.has(row.id)) {
        continue
      }

      if (isImageBackfilled(row, privateBucket)) {
        continue
      }

      const payload = buildPayload(row)
      if (!payload) {
        continue
      }

      candidates.push(payload)
      if (candidates.length >= options.limit) {
        break
      }
    }

    offset += rows.length
  }

  return candidates
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const supabase = createClient(
    getRequiredEnv('NEXT_PUBLIC_SUPABASE_URL'),
    getRequiredEnv('SUPABASE_SERVICE_ROLE_KEY'),
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  )
  const privateBucket = getRequiredEnv('R2_PRIVATE_BUCKET')
  const candidates = await collectCandidates(supabase, options, privateBucket)

  if (options.dryRun) {
    console.log(`dry-run: found ${candidates.length} image(s) needing backfill`)
    for (const candidate of candidates.slice(0, 20)) {
      console.log(candidate.image_id)
    }
    return
  }

  if (candidates.length === 0) {
    console.log('No images need backfill')
    return
  }

  const { error } = await supabase.from('media_jobs').insert(candidates)
  if (error) {
    throw error
  }

  console.log(`Queued ${candidates.length} backfill job(s)`)
}

main().catch((error) => {
  console.error('Failed to backfill images:', error)
  process.exitCode = 1
})
