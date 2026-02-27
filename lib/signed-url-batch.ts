export interface SignedUrlBatchRequestObject {
  bucket: string
  path: string
}

export interface BatchSignedUrlResult {
  bucket: string
  path: string
  signedUrl: string | null
}

export interface SignedUrlBatchResponse {
  results?: BatchSignedUrlResult[]
}

export function getSignedUrlBatchKey(bucket: string, path: string): string {
  return `${bucket}:${path}`
}
