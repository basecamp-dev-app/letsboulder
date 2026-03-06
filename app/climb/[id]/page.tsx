'use client'

import { useParams } from 'next/navigation'
import ClimbPageClient from '@/app/climb/components/ClimbPageClient'

export default function ClimbPage() {
  const params = useParams<{ id: string }>()

  return <ClimbPageClient climbId={params.id} enableCanonicalRedirect />
}
