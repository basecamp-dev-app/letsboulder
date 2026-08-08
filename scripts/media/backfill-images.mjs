import { createClient } from '@supabase/supabase-js'

const DEFAULT_LIMIT = 100
const DEFAULT_PAGE_SIZE = 200

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

function isImageBackfilled(row, privateBucket) {
  const canonicalOriginal = row.original_bucket === privateBucket && typeof row.original_key === 'string' && row.original_key.length > 0
  const canonicalWebp = row.optimized_bucket === privateBucket
    && typeof row.optimized_key === 'string' && row.optimized_key.length > 0
    && row.optimized_mime === 'image/webp'
  return row.storage_provider === 'r2' && canonicalOriginal && canonicalWebp
}

function buildPayload(row) {
  const originalBucket = row.original_bucket || row.storage_bucket
  const originalKey = row.original_key || row.storage_path

  if (!originalBucket || !originalKey) {
    return null
  }

  return {
    imageId: row.id,
    originalBucket,
    originalKey,
    storageProvider: row.storage_provider === 'r2' ? 'r2' : 'supabase',
    purpose: 'submission_image',
    triggeredByUserId: row.created_by,
    trigger: 'backfill',
  }
}

async function enqueuePayload(supabase, payload) {
  const { error } = await supabase.rpc('queue_media_ingest_job', {
    p_image_id: payload.imageId,
    p_original_bucket: payload.originalBucket,
    p_original_key: payload.originalKey,
    p_storage_provider: payload.storageProvider,
    p_purpose: payload.purpose,
    p_triggered_by_user_id: payload.triggeredByUserId,
    p_trigger: 'backfill',
    p_auto_approve: false,
  })
  if (error) throw error

  const workerUrl = getRequiredEnv('CF_MEDIA_WORKER_URL').replace(/\/$/, '')
  const workerSecret = getRequiredEnv('CF_MEDIA_WORKER_SECRET')
  const response = await fetch(`${workerUrl}/enqueue`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${workerSecret}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    throw new Error(`Failed to enqueue ${payload.imageId}: ${response.status} ${await response.text().catch(() => '')}`)
  }
}

async function collectCandidates(supabase, options, privateBucket) {
  const candidates = []
  let offset = 0

  while (candidates.length < options.limit) {
    const upperBound = offset + options.pageSize - 1
    const { data, error } = await supabase
      .from('images')
      .select('id, created_by, status, storage_provider, storage_bucket, storage_path, original_bucket, original_key, optimized_bucket, optimized_key, optimized_mime')
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

    for (const row of rows) {
      const originalKeyPrefix = `images/(assets|originals)/${row.id}/`
      if (row.storage_provider !== 'r2'
        || row.original_bucket !== privateBucket
        || typeof row.original_key !== 'string'
        || !(new RegExp(`^${originalKeyPrefix}`).test(row.original_key))
        || typeof row.created_by !== 'string') {
        continue
      }

      if (isImageBackfilled(row, privateBucket)) {
        continue
      }

      const payload = buildPayload(row)
      if (!payload || typeof payload.triggeredByUserId !== 'string') {
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
      console.log(candidate.imageId)
    }
    return
  }

  if (candidates.length === 0) {
    console.log('No images need backfill')
    return
  }

  for (const candidate of candidates) {
    await enqueuePayload(supabase, candidate)
  }

  console.log(`Queued ${candidates.length} backfill job(s)`)
}

main().catch((error) => {
  console.error('Failed to backfill images:', error)
  process.exitCode = 1
})
