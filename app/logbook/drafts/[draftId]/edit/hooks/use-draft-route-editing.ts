'use client'

import { useState } from 'react'

export function useDraftRouteEditing() {
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [orientationOpen, setOrientationOpen] = useState(false)

  return {
    detailsOpen,
    setDetailsOpen,
    orientationOpen,
    setOrientationOpen,
  }
}
