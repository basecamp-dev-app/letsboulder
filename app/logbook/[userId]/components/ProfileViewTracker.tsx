'use client'

import { useEffect } from 'react'
import { useParams } from 'next/navigation'

export default function ProfileViewTracker() {
  const params = useParams()
  const userId = params.userId as string

  useEffect(() => {
    if (userId) {
    }
  }, [userId])

  return null
}
