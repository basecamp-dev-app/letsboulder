export const MEDIA_VARIANT_WIDTHS = {
  thumb: 240,
  card: 640,
  detail: 1280,
  topo: 2048,
  full: 2560,
} as const

export const MEDIA_FORMATS = {
  avif: 'image/avif',
  webp: 'image/webp',
  jpeg: 'image/jpeg',
} as const

export type MediaVariantKey = keyof typeof MEDIA_VARIANT_WIDTHS
export type MediaFormatKey = keyof typeof MEDIA_FORMATS

export function getVariantWidth(variant: string | null): number | null {
  if (!variant) return null
  return MEDIA_VARIANT_WIDTHS[variant as MediaVariantKey] ?? null
}
