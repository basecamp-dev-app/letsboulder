'use client'

import type { ReactNode } from 'react'
import { CsrfProvider } from '@/components/CsrfProvider'

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <>
      <CsrfProvider />
      {children}
    </>
  )
}
