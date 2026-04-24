import { createClient } from '@supabase/supabase-js'

type WorkerQueue<T> = {
  send(message: T): Promise<void>
}

type WorkerR2Object = {
  size: number
  httpMetadata?: { contentType?: string | null }
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
}

export type MessageBatch<T> = {
  messages: Array<{
    body: T
    ack(): void
    retry(): void
  }>
}

export interface Env {
  ENABLE_MODERATION: string
  MEDIA_MODERATION_PROVIDER: string
  MEDIA_HOST: string
  R2_ORIGIN_URL: string
  R2_PRIVATE_BUCKET: string
  R2_PUBLIC_BUCKET: string
  SUPABASE_URL: string
  SUPABASE_SERVICE_ROLE_KEY: string
  INGRESS_SECRET: string
  INTERNAL_ORIGIN_SECRET: string
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
