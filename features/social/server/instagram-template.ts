import sharp from 'sharp'
import type { RoutePoint } from '@/types/domain'

export const INSTAGRAM_POST_WIDTH = 1080
export const INSTAGRAM_POST_HEIGHT = 1350

const TOP_PADDING = 76
const SIDE_PADDING = 72
const FOOTER_PADDING = 64

export interface InstagramPostLayout {
  width: number
  height: number
  drawWidth: number
  drawHeight: number
  offsetX: number
  offsetY: number
}

export interface InstagramPostRenderInput {
  imageBuffer: Buffer
  naturalWidth: number
  naturalHeight: number
  routePoints: RoutePoint[]
  routeColor: string
  locationText: string | null
  cragName: string
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function computeInstagramCoverLayout(
  naturalWidth: number,
  naturalHeight: number,
  frameWidth: number = INSTAGRAM_POST_WIDTH,
  frameHeight: number = INSTAGRAM_POST_HEIGHT
): InstagramPostLayout {
  const scale = Math.max(frameWidth / naturalWidth, frameHeight / naturalHeight)
  const drawWidth = naturalWidth * scale
  const drawHeight = naturalHeight * scale

  return {
    width: frameWidth,
    height: frameHeight,
    drawWidth,
    drawHeight,
    offsetX: (frameWidth - drawWidth) / 2,
    offsetY: (frameHeight - drawHeight) / 2,
  }
}

export function mapNormalizedPointsToInstagramPost(
  points: RoutePoint[],
  layout: InstagramPostLayout
): RoutePoint[] {
  return points
    .map((point) => ({
      x: layout.offsetX + point.x * layout.drawWidth,
      y: layout.offsetY + point.y * layout.drawHeight,
    }))
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
}

function buildQuadraticPath(points: RoutePoint[]): string {
  if (points.length < 2) return ''
  if (points.length === 2) {
    return `M ${points[0]!.x.toFixed(2)} ${points[0]!.y.toFixed(2)} L ${points[1]!.x.toFixed(2)} ${points[1]!.y.toFixed(2)}`
  }

  let path = `M ${points[0]!.x.toFixed(2)} ${points[0]!.y.toFixed(2)}`
  for (let index = 1; index < points.length - 1; index += 1) {
    const current = points[index]!
    const next = points[index + 1]!
    const midX = (current.x + next.x) / 2
    const midY = (current.y + next.y) / 2
    path += ` Q ${current.x.toFixed(2)} ${current.y.toFixed(2)} ${midX.toFixed(2)} ${midY.toFixed(2)}`
  }

  const last = points[points.length - 1]!
  path += ` L ${last.x.toFixed(2)} ${last.y.toFixed(2)}`
  return path
}

function buildOverlaySvg(input: {
  width: number
  height: number
  pathData: string
  routeColor: string
  locationText: string | null
  cragName: string
}) {
  const locationMarkup = input.locationText
    ? `<text x="${SIDE_PADDING}" y="${TOP_PADDING}" font-family="Arial, Helvetica, sans-serif" font-size="30" font-weight="700" letter-spacing="3" fill="rgba(255,255,255,0.94)">${escapeXml(input.locationText.toUpperCase())}</text>`
    : ''

  const titleY = input.locationText ? TOP_PADDING + 58 : TOP_PADDING + 10

  return `
    <svg width="${input.width}" height="${input.height}" viewBox="0 0 ${input.width} ${input.height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="topFade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="rgba(0,0,0,0.52)" />
          <stop offset="38%" stop-color="rgba(0,0,0,0.10)" />
          <stop offset="100%" stop-color="rgba(0,0,0,0)" />
        </linearGradient>
        <linearGradient id="bottomFade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="rgba(0,0,0,0)" />
          <stop offset="100%" stop-color="rgba(0,0,0,0.34)" />
        </linearGradient>
      </defs>

      <rect width="${input.width}" height="${input.height}" fill="url(#topFade)" />
      <rect y="${input.height - 260}" width="${input.width}" height="260" fill="url(#bottomFade)" />

      <path d="${input.pathData}" fill="none" stroke="rgba(0,0,0,0.45)" stroke-width="18" stroke-linecap="round" stroke-linejoin="round" />
      <path d="${input.pathData}" fill="none" stroke="${escapeXml(input.routeColor)}" stroke-width="10" stroke-linecap="round" stroke-linejoin="round" />

      ${locationMarkup}
      <text x="${SIDE_PADDING}" y="${titleY}" font-family="Arial, Helvetica, sans-serif" font-size="64" font-weight="800" fill="rgba(255,255,255,0.98)">${escapeXml(input.cragName)}</text>
      <text x="${SIDE_PADDING}" y="${input.height - FOOTER_PADDING}" font-family="Arial, Helvetica, sans-serif" font-size="28" font-weight="700" fill="rgba(255,255,255,0.90)">letsboulder.com</text>
    </svg>
  `.trim()
}

export async function renderInstagramPost(input: InstagramPostRenderInput): Promise<Buffer> {
  const layout = computeInstagramCoverLayout(input.naturalWidth, input.naturalHeight)
  const mappedPoints = mapNormalizedPointsToInstagramPost(input.routePoints, layout)
  const pathData = buildQuadraticPath(mappedPoints)

  const baseImage = await sharp(input.imageBuffer)
    .resize(INSTAGRAM_POST_WIDTH, INSTAGRAM_POST_HEIGHT, {
      fit: 'cover',
      position: 'centre',
    })
    .png()
    .toBuffer()

  if (!pathData) {
    return sharp(baseImage)
      .composite([{
        input: Buffer.from(buildOverlaySvg({
          width: INSTAGRAM_POST_WIDTH,
          height: INSTAGRAM_POST_HEIGHT,
          pathData: `M 0 0`,
          routeColor: input.routeColor,
          locationText: input.locationText,
          cragName: input.cragName,
        })),
      }])
      .png()
      .toBuffer()
  }

  return sharp(baseImage)
    .composite([{
      input: Buffer.from(buildOverlaySvg({
        width: INSTAGRAM_POST_WIDTH,
        height: INSTAGRAM_POST_HEIGHT,
        pathData,
        routeColor: input.routeColor,
        locationText: input.locationText,
        cragName: input.cragName,
      })),
    }])
    .png()
    .toBuffer()
}
