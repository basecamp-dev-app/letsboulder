import { serverEnv } from '@/lib/env'
import { createPrivateReadUrl, createPrivateReadUrls } from '@/lib/media/r2'

export interface StorageObjectRef {
  bucket: string
  path: string
  /** Extracted upload-session UUID from the path (images/originals/{uuid}/...) */
  uploadSessionId?: string | null
}

const PRIVATE_URL_PREFIX = 'private://'
const SIGNED_URL_TTL_SECONDS = 3600

export function parsePrivateStorageUrl(url: string | null | undefined): StorageObjectRef | null {
  if (!url || !url.startsWith(PRIVATE_URL_PREFIX)) return null

  const withoutPrefix = url.slice(PRIVATE_URL_PREFIX.length)
  const firstSlashIndex = withoutPrefix.indexOf('/')
  if (firstSlashIndex <= 0) return null

  const bucket = withoutPrefix.slice(0, firstSlashIndex)
  const path = withoutPrefix.slice(firstSlashIndex + 1)
  if (!bucket || !path) return null

  const uuidMatch = path.match(/images\/originals\/([0-9a-fA-F-]{36})/)
  const uploadSessionId = uuidMatch?.[1] ?? null

  return { bucket, path, uploadSessionId }
}

export function isR2ManagedBucket(bucket: string): boolean {
  return bucket === serverEnv.R2_PRIVATE_BUCKET || bucket === serverEnv.R2_PUBLIC_BUCKET
}

export async function createSignedObjectUrl(
  bucket: string,
  path: string,
  supabaseSigner?: { storage: { from: (bucketName: string) => { createSignedUrl: (objectPath: string, expiresIn: number) => Promise<{ data: { signedUrl?: string | null } | null; error: { message?: string } | null }> } } }
): Promise<string | null> {
  if (isR2ManagedBucket(bucket)) {
    return createPrivateReadUrl(bucket, path, SIGNED_URL_TTL_SECONDS)
  }

  if (!supabaseSigner) {
    throw new Error(`No signer available for bucket ${bucket}`)
  }

  const { data, error } = await supabaseSigner.storage.from(bucket).createSignedUrl(path, SIGNED_URL_TTL_SECONDS)
  if (error || !data?.signedUrl) {
    return null
  }

  return data.signedUrl
}

export async function createSignedObjectUrls(
  refs: StorageObjectRef[],
  supabaseSigner?: { storage: { from: (bucketName: string) => { createSignedUrls: (objectPaths: string[], expiresIn: number) => Promise<{ data: Array<{ path?: string | null; signedUrl?: string | null }> | null; error: { message?: string } | null }> } } }
): Promise<Map<string, string | null>> {
  const signedByKey = new Map<string, string | null>()
  const r2RefsByBucket = new Map<string, string[]>()
  const legacyRefsByBucket = new Map<string, string[]>()

  for (const ref of refs) {
    if (isR2ManagedBucket(ref.bucket)) {
      const current = r2RefsByBucket.get(ref.bucket) || []
      current.push(ref.path)
      r2RefsByBucket.set(ref.bucket, current)
      continue
    }

    const current = legacyRefsByBucket.get(ref.bucket) || []
    current.push(ref.path)
    legacyRefsByBucket.set(ref.bucket, current)
  }

  for (const [bucket, paths] of r2RefsByBucket.entries()) {
    const signed = await createPrivateReadUrls(bucket, paths, SIGNED_URL_TTL_SECONDS)
    for (const path of paths) {
      signedByKey.set(`${bucket}:${path}`, signed.get(path) ?? null)
    }
  }

  for (const [bucket, paths] of legacyRefsByBucket.entries()) {
    if (!supabaseSigner) {
      for (const path of paths) {
        signedByKey.set(`${bucket}:${path}`, null)
      }
      continue
    }

    const uniquePaths = Array.from(new Set(paths))
    const { data, error } = await supabaseSigner.storage.from(bucket).createSignedUrls(uniquePaths, SIGNED_URL_TTL_SECONDS)
    if (error) {
      for (const path of uniquePaths) {
        signedByKey.set(`${bucket}:${path}`, null)
      }
      continue
    }

    const byPath = new Map<string, string>()
    for (const item of data || []) {
      if (item?.path && item?.signedUrl) {
        byPath.set(item.path, item.signedUrl)
      }
    }

    for (const path of uniquePaths) {
      signedByKey.set(`${bucket}:${path}`, byPath.get(path) ?? null)
    }
  }

  return signedByKey
}
