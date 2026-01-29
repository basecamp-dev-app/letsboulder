'use client'

import { useEffect, useRef } from 'react'

type OverlayCloser = () => void

const OVERLAY_MARKER_KEY = '__overlayMarker'
const OVERLAY_TOP_KEY = '__overlayTop'

let overlayStack: string[] = []
const overlayClosers = new Map<string, OverlayCloser>()
let markerUrl: string | null = null
let popstateAttached = false
let closingFromPopstateId: string | null = null

const suppressedCleanupIds = new Set<string>()

export function suppressOverlayCleanup(id: string) {
  suppressedCleanupIds.add(id)
}

function getHistoryState(): Record<string, unknown> {
  const s = window.history.state
  if (s && typeof s === 'object') return s as Record<string, unknown>
  return {}
}

function hasOverlayMarker(): boolean {
  return Boolean((window.history.state as Record<string, unknown> | null)?.[OVERLAY_MARKER_KEY])
}

function getTopOverlayId(): string | null {
  return overlayStack.length > 0 ? overlayStack[overlayStack.length - 1] : null
}

function pushMarkerState(topId: string) {
  const nextState = {
    ...getHistoryState(),
    [OVERLAY_MARKER_KEY]: true,
    [OVERLAY_TOP_KEY]: topId,
  }
  window.history.pushState(nextState, '', window.location.href)
}

function replaceMarkerState(topId: string) {
  const nextState = {
    ...getHistoryState(),
    [OVERLAY_MARKER_KEY]: true,
    [OVERLAY_TOP_KEY]: topId,
  }
  window.history.replaceState(nextState, '', window.location.href)
}

function handlePopState() {
  const topId = getTopOverlayId()
  if (!topId) return

  const closer = overlayClosers.get(topId)
  if (!closer) {
    overlayStack = overlayStack.filter((id) => id !== topId)
    return
  }

  closingFromPopstateId = topId
  closer()

  window.setTimeout(() => {
    if (overlayStack.length === 0) return
    markerUrl = window.location.href
    pushMarkerState(getTopOverlayId()!)
  }, 0)
}

function ensurePopstateListener() {
  if (popstateAttached) return
  window.addEventListener('popstate', handlePopState)
  popstateAttached = true
}

function registerOverlay(id: string, onClose: OverlayCloser) {
  ensurePopstateListener()
  overlayClosers.set(id, onClose)

  const wasEmpty = overlayStack.length === 0
  overlayStack = overlayStack.filter((x) => x !== id)
  overlayStack.push(id)

  if (wasEmpty) {
    markerUrl = window.location.href
    pushMarkerState(id)
  } else if (hasOverlayMarker()) {
    replaceMarkerState(id)
  }
}

function unregisterOverlay(id: string) {
  overlayClosers.delete(id)

  const closedByPopstate = closingFromPopstateId === id
  if (closedByPopstate) closingFromPopstateId = null

  const suppressCleanup = suppressedCleanupIds.has(id)
  if (suppressCleanup) suppressedCleanupIds.delete(id)

  overlayStack = overlayStack.filter((x) => x !== id)

  if (overlayStack.length === 0) {
    const shouldCleanupDummyEntry =
      !closedByPopstate &&
      !suppressCleanup &&
      markerUrl !== null &&
      window.location.href === markerUrl &&
      hasOverlayMarker()

    markerUrl = null

    if (shouldCleanupDummyEntry) {
      window.history.back()
    }
    return
  }

  if (closedByPopstate) {
    // After a hardware back press, the marker entry was already popped.
    // We re-push it in the popstate handler so the next back closes the next overlay.
    return
  }

  if (hasOverlayMarker()) {
    replaceMarkerState(getTopOverlayId()!)
  }
}

interface UseOverlayHistoryParams {
  open: boolean
  onClose: () => void
  id: string
}

export function useOverlayHistory({ open, onClose, id }: UseOverlayHistoryParams) {
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (!open) return
    if (typeof window === 'undefined') return

    registerOverlay(id, () => onCloseRef.current())
    return () => unregisterOverlay(id)
  }, [open, id])
}
