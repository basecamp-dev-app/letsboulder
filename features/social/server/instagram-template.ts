import sharp from 'sharp'

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

export async function renderInstagramPost(input: InstagramPostRenderInput): Promise<Buffer> {
  return sharp(input.imageBuffer)
    .resize(INSTAGRAM_POST_WIDTH, INSTAGRAM_POST_HEIGHT, {
      fit: 'cover',
      position: 'centre',
    })
    .png()
    .toBuffer()
}
