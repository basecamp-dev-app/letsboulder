import { createErrorResponse } from '@/lib/errors'

export interface CragImageRow {
  id: string
  url: string
  crag_id: string | null
  width: number | null
  height: number | null
  latitude: number | null
  longitude: number | null
  source_image_id: string | null
  linked_image_id: string | null
  source_image: {
    id: string
    latitude: number | null
    longitude: number | null
    capture_date: string | null
  } | Array<{
    id: string
    latitude: number | null
    longitude: number | null
    capture_date: string | null
  }> | null
}

export interface RoutePayloadItem {
  name: string
  slug: string | null
  grade: string
  description: string | null
  points: Array<{ x: number; y: number }>
  sequence_order: number
  image_width: number
  image_height: number
}

export interface ExecutorDependencies {
  supabase: ReturnType<typeof import('@supabase/ssr').createServerClient>
  supabaseAdmin: ReturnType<typeof import('@supabase/ssr').createServerClient> | null
  createErrorResponse: typeof createErrorResponse
}
