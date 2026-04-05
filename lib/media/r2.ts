import { S3Client, PutObjectCommand, HeadObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { serverEnv } from '@/lib/env.server'
import { getMediaStorageConfig } from '@/lib/media/config'

const R2_REGION = 'auto'
const UPLOAD_URL_TTL_SECONDS = 900
const READ_URL_TTL_SECONDS = 3600

function getR2Credentials() {
  return { 
    accessKeyId: serverEnv.R2_ACCESS_KEY_ID ?? '', 
    secretAccessKey: serverEnv.R2_SECRET_ACCESS_KEY ?? '' 
  }
}

export function createR2Client(): S3Client {
  const storage = getMediaStorageConfig()
  const credentials = getR2Credentials()

  return new S3Client({
    region: R2_REGION,
    endpoint: storage.s3Endpoint,
    credentials,
  })
}

export async function createPrivateUploadUrl(objectKey: string, contentType: string) {
  const storage = getMediaStorageConfig()
  const client = createR2Client()

  const command = new PutObjectCommand({
    Bucket: storage.privateBucket,
    Key: objectKey,
    ContentType: contentType,
  })

  const uploadUrl = await getSignedUrl(client, command, { expiresIn: UPLOAD_URL_TTL_SECONDS })

  return {
    bucket: storage.privateBucket,
    objectKey,
    uploadUrl,
    expiresInSeconds: UPLOAD_URL_TTL_SECONDS,
    uploadHeaders: {
      'Content-Type': contentType,
    },
  }
}

export async function ensurePrivateObjectExists(objectKey: string) {
  const storage = getMediaStorageConfig()
  const client = createR2Client()

  await client.send(new HeadObjectCommand({
    Bucket: storage.privateBucket,
    Key: objectKey,
  }))
}

export async function createPrivateReadUrl(bucket: string, objectKey: string, expiresInSeconds = READ_URL_TTL_SECONDS) {
  const client = createR2Client()
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: objectKey,
  })

  return getSignedUrl(client, command, { expiresIn: expiresInSeconds })
}

export async function createPrivateReadUrls(bucket: string, objectKeys: string[], expiresInSeconds = READ_URL_TTL_SECONDS) {
  const uniqueKeys = Array.from(new Set(objectKeys.filter(Boolean)))
  const signedByKey = new Map<string, string>()

  await Promise.all(uniqueKeys.map(async (objectKey) => {
    const signedUrl = await createPrivateReadUrl(bucket, objectKey, expiresInSeconds)
    signedByKey.set(objectKey, signedUrl)
  }))

  return signedByKey
}

export async function deleteObject(bucket: string, objectKey: string) {
  const client = createR2Client()

  await client.send(new DeleteObjectCommand({
    Bucket: bucket,
    Key: objectKey,
  }))
}
