'use client'

import dynamic from 'next/dynamic'

const ChunkLoadRecovery = dynamic(() => import('@/components/ChunkLoadRecovery'), { ssr: false })
const DevBrowserLogger = dynamic(() => import('@/components/DevBrowserLogger'), { ssr: false })
const LastRoutePersistence = dynamic(() => import('@/components/LastRoutePersistence'), { ssr: false })
const ServiceWorkerRegistration = dynamic(() => import('@/components/ServiceWorkerRegistration'), { ssr: false })
const OfflinePackRecovery = dynamic(() => import('@/features/offline/components/OfflinePackRecovery'), { ssr: false })

export default function RootClientUtilities() {
  return (
    <>
      <ChunkLoadRecovery />
      <DevBrowserLogger />
      <LastRoutePersistence />
      <ServiceWorkerRegistration />
      <OfflinePackRecovery />
    </>
  )
}
