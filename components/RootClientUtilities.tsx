'use client'

import dynamic from 'next/dynamic'

const ChunkLoadRecovery = dynamic(() => import('@/components/ChunkLoadRecovery'), { ssr: false })
const DevBrowserLogger = dynamic(() => import('@/components/DevBrowserLogger'), { ssr: false })
const ServiceWorkerRegistration = dynamic(() => import('@/components/ServiceWorkerRegistration'), { ssr: false })

export default function RootClientUtilities() {
  return (
    <>
      <ChunkLoadRecovery />
      <DevBrowserLogger />
      <ServiceWorkerRegistration />
    </>
  )
}
