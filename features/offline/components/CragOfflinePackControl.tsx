'use client'

import { Download, RefreshCw, Trash2, X } from 'lucide-react'
import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { useOfflinePacks } from '@/features/offline/hooks/use-offline-packs'
import { fetchOfflinePackManifest } from '@/features/offline/lib/offline-pack-manifest'
import type { OfflinePackManifest, OfflineStorageStatus } from '@/features/offline/lib/offline-pack-types'

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.ceil(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`
}

export default function CragOfflinePackControl({ cragId }: { cragId: string }) {
  const { packs, loading, error, install, remove } = useOfflinePacks()
  const packId = `crag:${cragId}`
  const manifestUrl = `/api/offline-packs/crags/${encodeURIComponent(cragId)}/manifest`
  const pack = packs.find((candidate) => candidate.packId === packId)
  const ready = pack?.status === 'ready' && pack.activeVersion !== null
  const [availableUpdate, setAvailableUpdate] = useState<OfflinePackManifest | null>(null)
  const [storageStatus, setStorageStatus] = useState<OfflineStorageStatus | null>(null)

  useEffect(() => {
    let active = true
    if (!ready || !navigator.onLine) return () => { active = false }

    void fetchOfflinePackManifest(manifestUrl)
      .then((manifest) => {
        if (active) setAvailableUpdate(manifest.version === pack.activeVersion ? null : manifest)
      })
      .catch(() => undefined)

    return () => { active = false }
  }, [manifestUrl, pack?.activeVersion, ready])

  const handleInstall = async () => {
    setStorageStatus(null)
    try {
      setStorageStatus(await install(manifestUrl))
    } catch {
      // The shared store exposes the actionable error beside the control.
    }
  }

  const handleUpdate = async () => {
    if (!availableUpdate) return
    const confirmed = globalThis.confirm(`Update this offline guide? The latest pack is up to ${formatBytes(availableUpdate.estimatedBytes)}.`)
    if (!confirmed) return
    try {
      setStorageStatus(await install(manifestUrl))
      setAvailableUpdate(null)
    } catch {
      // The active version remains available and the store exposes the error.
    }
  }

  const handleRemove = async () => {
    if (!globalThis.confirm('Remove this crag from the offline library on this device?')) return
    try {
      await remove(packId)
      setAvailableUpdate(null)
      setStorageStatus(null)
    } catch {
      // The store exposes the error and retains any still-active version.
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2" aria-live="polite">
      {ready ? (
        <Button asChild type="button" variant="outline" className="min-h-11 rounded-full border-emerald-200 bg-emerald-50 px-3 text-emerald-900 shadow-none hover:bg-emerald-100 dark:border-emerald-900/60 dark:bg-emerald-900/30 dark:text-emerald-200 dark:hover:bg-emerald-900/50">
          <a href={`/offline/crag?id=${encodeURIComponent(cragId)}`}><Download className="size-4" /> Offline guide</a>
        </Button>
      ) : (
        <Button type="button" variant="outline" onClick={() => void handleInstall()} disabled={loading} className="min-h-11 rounded-full border-stone-200 bg-stone-50 px-3 text-stone-700 shadow-none hover:bg-stone-100 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700">
          <Download className="size-4" /> {loading ? 'Downloading...' : pack?.status === 'error' ? 'Retry download' : 'Download offline'}
        </Button>
      )}
      {ready && availableUpdate ? (
        <Button type="button" variant="outline" onClick={() => void handleUpdate()} disabled={loading} className="min-h-11 rounded-full border-amber-200 bg-amber-50 px-3 text-amber-900 shadow-none hover:bg-amber-100 dark:border-amber-900/60 dark:bg-amber-900/30 dark:text-amber-200">
          <RefreshCw className="size-4" /> Update
        </Button>
      ) : null}
      {ready ? (
        <Button type="button" variant="ghost" size="icon" onClick={() => void handleRemove()} disabled={loading} aria-label="Remove offline guide" title="Remove offline guide" className="size-11 rounded-full text-stone-500 hover:text-red-700 dark:text-gray-400 dark:hover:text-red-300">
          <Trash2 className="size-4" />
        </Button>
      ) : null}
      {storageStatus ? (
        <div className="basis-full rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-950 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-100" role="status">
          <div className="flex items-start justify-between gap-3">
            <p className="font-medium">{storageStatus.persisted === true ? 'Protected storage enabled' : 'Browser may evict this content'}</p>
            <Button type="button" variant="ghost" size="icon-sm" onClick={() => setStorageStatus(null)} aria-label="Dismiss storage status" className="-mr-1 -mt-1 rounded-full">
              <X aria-hidden="true" />
            </Button>
          </div>
          {storageStatus.persisted !== true ? (
            <p className="mt-2 text-xs leading-5 text-emerald-900/80 dark:text-emerald-100/80">For reliable offline storage on iPhone, use your browser&apos;s Share menu and choose <strong>Add to Home Screen</strong>.</p>
          ) : null}
        </div>
      ) : null}
      {error ? <span className="max-w-56 text-xs text-red-700 dark:text-red-300">{error}</span> : null}
    </div>
  )
}
