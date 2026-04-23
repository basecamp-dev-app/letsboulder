'use client'

import { useEffect, useState, type ReactNode } from 'react'
import type { ImageFirstPayload } from '@/features/image-first/types'

type ImageFirstClientComponent = (props: { payload: ImageFirstPayload }) => ReactNode

export default function ImageFirstClientLoader({ payload }: { payload: ImageFirstPayload }) {
  const [hydrated, setHydrated] = useState(false)
  const [ClientComponent, setClientComponent] = useState<ImageFirstClientComponent | null>(null)

  useEffect(() => {
    setHydrated(true)
    void import('@/features/image-first/components/ImageFirstClient').then((mod) => {
      setClientComponent(() => mod.default)
    })
  }, [])

  if (!hydrated || !ClientComponent) return null

  return (
    <>
      <style>{'[data-image-first-server-shell="true"]{display:none}'}</style>
      <ClientComponent payload={payload} />
    </>
  )
}
