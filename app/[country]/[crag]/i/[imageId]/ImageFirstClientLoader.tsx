'use client'

import dynamic from 'next/dynamic'
import type { ImageFirstPayload } from '@/app/[country]/[crag]/i/[imageId]/image-page-server'

const ImageFirstClient = dynamic(
  () =>
    import('@/app/[country]/[crag]/i/[imageId]/ImageFirstClient').then(
      (mod) => mod.default
    ),
  { ssr: false }
)

export default function ImageFirstClientLoader({ payload }: { payload: ImageFirstPayload }) {
  return <ImageFirstClient payload={payload} />
}
