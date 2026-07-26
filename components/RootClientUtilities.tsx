'use client'

import dynamic from 'next/dynamic'

const ChunkLoadRecovery = dynamic(() => import('@/components/ChunkLoadRecovery'), { ssr: false })
const DevBrowserLogger = dynamic(() => import('@/components/DevBrowserLogger'), { ssr: false })
const LastRoutePersistence = dynamic(() => import('@/components/LastRoutePersistence'), { ssr: false })
const OfflineRetirementCleanup = dynamic(() => import('@/components/OfflineRetirementCleanup'), { ssr: false })

export default function RootClientUtilities() {
  return (
    <>
      <ChunkLoadRecovery />
      <DevBrowserLogger />
      <LastRoutePersistence />
      <OfflineRetirementCleanup />
    </>
  )
}
