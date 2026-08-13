import { createClient } from '@supabase/supabase-js'

type WorkerQueue<T> = {
  send(message: T): Promise<void>
}

type WorkerR2Object = {
  size: number
  etag: string
  httpMetadata?: { contentType?: string | null }
}

type WorkerR2PutOptions = {
  httpMetadata?: { contentType?: string; cacheControl?: string }
}

type WorkerR2Range = {
  offset: number
  length?: number
}

type WorkerR2ObjectBody = WorkerR2Object & {
  body: ReadableStream<Uint8Array> | null
  writeHttpMetadata(headers: Headers): void
}

type WorkerR2Bucket = {
  head(key: string): Promise<WorkerR2Object | null>
  get(key: string, options?: { range?: WorkerR2Range }): Promise<WorkerR2ObjectBody | null>
  put(key: string, value: ArrayBuffer | ArrayBufferView | Blob | ReadableStream | string, options?: WorkerR2PutOptions): Promise<WorkerR2Object | null>
  delete(key: string): Promise<void>
}

type WorkerImagesBinding = {
  input(stream: ReadableStream<Uint8Array>): {
    transform(options: { width: number; fit: 'scale-down' }): {
      output(options: { format: 'image/webp'; quality: number }): Promise<{
        response(): Response
      }>
    }
  }
}

export type MessageBatch<T> = {
  messages: Array<{
    body: T
    ack(): void
    retry(): void
  }>
}

export interface Env {
  MEDIA_HOST: string
  R2_ORIGIN_URL: string
  R2_PRIVATE_BUCKET: string
  R2_PUBLIC_BUCKET: string
  SUPABASE_URL: string
  SUPABASE_ANON_KEY: string
  SUPABASE_SERVICE_ROLE_KEY: string
  INGRESS_SECRET: string
  INTERNAL_ORIGIN_SECRET: string
  IMAGES: WorkerImagesBinding
  ORIGINALS_BUCKET: WorkerR2Bucket
  PUBLIC_BUCKET: WorkerR2Bucket
  MEDIA_QUEUE: WorkerQueue<unknown>
}

export function createSupabaseAdminClient(env: Env) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

export function createSupabasePublicClient(env: Env) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}
