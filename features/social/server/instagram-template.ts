import sharp from 'sharp'
import type { RoutePoint } from '@/types/domain'

export const INSTAGRAM_POST_WIDTH = 1080
export const INSTAGRAM_POST_HEIGHT = 1350

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
  routes?: Array<{
    routePoints: RoutePoint[]
    strokeColor: string
    isSelected: boolean
  }>
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
  paths: Array<{ pathData: string; strokeColor: string; isSelected: boolean }>
}) {
  const orderedPaths = [...input.paths].sort((left, right) => Number(left.isSelected) - Number(right.isSelected))
  const pathMarkup = orderedPaths.map((path) => `
      <path d="${path.pathData}" fill="none" stroke="rgba(0,0,0,0.45)" stroke-width="18" stroke-linecap="round" stroke-linejoin="round" />
      <path d="${path.pathData}" fill="none" stroke="${path.strokeColor}" stroke-width="10" stroke-linecap="round" stroke-linejoin="round" />
  `).join('')

  return `
    <svg width="${input.width}" height="${input.height}" viewBox="0 0 ${input.width} ${input.height}" xmlns="http://www.w3.org/2000/svg">
      ${pathMarkup}
    </svg>
  `.trim()
}

export async function renderInstagramPost(input: InstagramPostRenderInput): Promise<Buffer> {
  const baseImage = await sharp(input.imageBuffer, { failOn: 'none' })
    .resize(INSTAGRAM_POST_WIDTH, INSTAGRAM_POST_HEIGHT, {
      fit: 'cover',
      position: 'centre',
    })
    .png()
    .toBuffer()

  const overlayPaths = (input.routes || [])
    .map((route) => {
      const mappedPoints = mapNormalizedPointsToInstagramPost(
        route.routePoints,
        computeInstagramCoverLayout(input.naturalWidth, input.naturalHeight)
      )
      const pathData = buildQuadraticPath(mappedPoints)
      if (!pathData) return null
      return {
        pathData,
        strokeColor: route.strokeColor,
        isSelected: route.isSelected,
      }
    })
    .filter((route): route is NonNullable<typeof route> => route !== null)

  if (overlayPaths.length === 0) {
    return baseImage
  }

  return sharp(baseImage)
    .composite([{
      input: Buffer.from(buildOverlaySvg({
        width: INSTAGRAM_POST_WIDTH,
        height: INSTAGRAM_POST_HEIGHT,
        paths: overlayPaths,
      })),
    }])
    .png()
    .toBuffer()
}
