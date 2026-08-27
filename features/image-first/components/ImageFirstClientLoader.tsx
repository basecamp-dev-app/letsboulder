'use client'

import { useEffect, useState, type ReactNode } from 'react'
import ClimbPageSkeleton from '@/components/ClimbPageSkeleton'
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

  return (
    <>
      <style>{'[data-image-first-server-shell="true"]{display:none}'}</style>
      {!hydrated || !ClientComponent ? (
        <div data-image-first-client-loading="true">
          <ClimbPageSkeleton />
        </div>
      ) : (
        <ClientComponent payload={payload} />
      )}
      <noscript>
        <style>{'[data-image-first-server-shell="true"]{display:block}[data-image-first-client-loading="true"]{display:none}'}</style>
      </noscript>
    </>
  )
}
