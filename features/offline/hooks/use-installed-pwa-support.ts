'use client'

import { useSyncExternalStore } from 'react'

interface StandaloneNavigator extends Navigator {
  standalone?: boolean
}

function getSnapshot(): boolean {
  if (typeof window.matchMedia !== 'function') return true
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as StandaloneNavigator).standalone === true
}

function subscribe(listener: () => void): () => void {
  if (typeof window.matchMedia !== 'function') return () => undefined
  const displayMode = window.matchMedia('(display-mode: standalone)')
  displayMode.addEventListener?.('change', listener)
  return () => displayMode.removeEventListener?.('change', listener)
}

export function useInstalledPwaSupport(): boolean | null {
  return useSyncExternalStore(subscribe, getSnapshot, () => null)
}
