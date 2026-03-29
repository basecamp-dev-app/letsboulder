'use client'

import type { ReactNode } from 'react'
import { CsrfProvider } from '@/components/csrf-provider'

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <>
      <CsrfProvider />
      {children}
    </>
  )
}
