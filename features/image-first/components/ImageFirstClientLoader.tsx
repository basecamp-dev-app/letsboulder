'use client'

import dynamic from 'next/dynamic'
import type { ImageFirstPayload } from '@/features/image-first/types'

const ImageFirstClient = dynamic(
  () =>
    import('@/features/image-first/components/ImageFirstClient').then(
      (mod) => mod.default
    ),
  { ssr: false }
)

export default function ImageFirstClientLoader({ payload }: { payload: ImageFirstPayload }) {
  return <ImageFirstClient payload={payload} />
}
