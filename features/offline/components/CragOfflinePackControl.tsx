'use client'

import { Download, RefreshCw, Trash2, X } from 'lucide-react'
import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { useConnectivity } from '@/features/offline/hooks/use-connectivity'
import { useOfflinePacks } from '@/features/offline/hooks/use-offline-packs'
import { useInstalledPwaSupport } from '@/features/offline/hooks/use-installed-pwa-support'
import { fetchOfflinePackManifest } from '@/features/offline/lib/offline-pack-manifest'
import type { OfflinePackManifest, OfflineStorageStatus } from '@/features/offline/lib/offline-pack-types'

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.ceil(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`
}

export default function CragOfflinePackControl({ cragId }: { cragId: string }) {
  const { packs, loading, error, install, repair, remove, discardFailed } = useOfflinePacks()
  const { status: connectivity } = useConnectivity()
  const installedPwa = useInstalledPwaSupport()
  const packId = `crag:${cragId}`
  const manifestUrl = `/api/offline-packs/crags/${encodeURIComponent(cragId)}/manifest`
  const pack = packs.find((candidate) => candidate.packId === packId)
  const ready = Boolean(pack?.activeVersion) && pack?.status !== 'unsupported'
  const degraded = pack?.status === 'needs-repair'
  const failedDownload = pack?.error !== null && pack?.error !== undefined
  const [availableUpdate, setAvailableUpdate] = useState<OfflinePackManifest | null>(null)
  const [storageStatus, setStorageStatus] = useState<OfflineStorageStatus | null>(null)

  useEffect(() => {
    let active = true
    if (connectivity !== 'online') return () => { active = false }

    void fetchOfflinePackManifest(manifestUrl)
      .then((manifest) => {
        if (active) setAvailableUpdate(ready && manifest.version === pack?.activeVersion ? null : manifest)
      })
      .catch(() => undefined)

    return () => { active = false }
  }, [connectivity, manifestUrl, pack?.activeVersion, ready])

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
    const confirmed = globalThis.confirm(`Update this offline guide? The verified download is exactly ${formatBytes(availableUpdate.exactTotalBytes)}.`)
    if (!confirmed) return
    try {
      setStorageStatus(await install(manifestUrl))
      setAvailableUpdate(null)
    } catch {
      // The active version remains available and the store exposes the error.
    }
  }

  const handleRepair = async () => {
    try {
      await repair(packId)
    } catch {
      // The store exposes the actionable error.
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

  const handleDiscardFailed = async () => {
    if (!globalThis.confirm('Discard this failed download and remove its partial media from this device?')) return
    try {
      await discardFailed(packId)
      setStorageStatus(null)
    } catch {
      // The store exposes the error.
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2" aria-live="polite">
      {ready ? (
        <Button asChild type="button" variant="outline" className="min-h-11 rounded-full border-emerald-200 bg-emerald-50 px-3 text-emerald-900 shadow-none hover:bg-emerald-100 dark:border-emerald-900/60 dark:bg-emerald-900/30 dark:text-emerald-200 dark:hover:bg-emerald-900/50">
          <a href={`/offline/crag?id=${encodeURIComponent(cragId)}`}><Download className="size-4" /> Offline guide</a>
        </Button>
      ) : (
        <Button type="button" variant="outline" onClick={() => void handleInstall()} disabled={loading || connectivity !== 'online'} className="min-h-11 rounded-full border-stone-200 bg-stone-50 px-3 text-stone-700 shadow-none hover:bg-stone-100 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700">
          <Download className="size-4" /> {loading ? 'Downloading and verifying...' : connectivity === 'checking' ? 'Checking connection...' : connectivity === 'offline' ? 'Reconnect to download' : pack?.status === 'needs-repair' ? 'Retry download' : 'Download offline'}
        </Button>
      )}
      {ready && degraded ? (
        <Button type="button" variant="outline" onClick={() => void handleRepair()} disabled={loading} className="min-h-11 rounded-full border-amber-200 bg-amber-50 px-3 text-amber-900 shadow-none hover:bg-amber-100 dark:border-amber-900/60 dark:bg-amber-900/30 dark:text-amber-200">
          <RefreshCw className="size-4" /> {loading ? 'Repairing...' : 'Repair media'}
        </Button>
      ) : null}
      {ready && !degraded && availableUpdate ? (
        <Button type="button" variant="outline" onClick={() => void handleUpdate()} disabled={loading} className="min-h-11 rounded-full border-amber-200 bg-amber-50 px-3 text-amber-900 shadow-none hover:bg-amber-100 dark:border-amber-900/60 dark:bg-amber-900/30 dark:text-amber-200">
          <RefreshCw className="size-4" /> Update
        </Button>
      ) : null}
      {failedDownload ? (
        <Button type="button" variant="ghost" onClick={() => void handleDiscardFailed()} disabled={loading} className="min-h-11 rounded-full text-red-700 hover:text-red-800 dark:text-red-300">
          <Trash2 className="size-4" /> Discard failed download
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
            <p className="font-medium">{installedPwa === false ? 'Unsupported browser-tab mode · integrity checks passed' : 'Verified on this device'} · {storageStatus.persisted === true ? 'Protected storage enabled' : 'Storage is at risk of eviction'}</p>
            <Button type="button" variant="ghost" size="icon-sm" onClick={() => setStorageStatus(null)} aria-label="Dismiss storage status" className="-mr-1 -mt-1 rounded-full">
              <X aria-hidden="true" />
            </Button>
          </div>
          {storageStatus.persisted !== true ? (
            <p className="mt-2 text-xs leading-5 text-emerald-900/80 dark:text-emerald-100/80">For reliable offline storage on iPhone, use your browser&apos;s Share menu and choose <strong>Add to Home Screen</strong>.</p>
          ) : null}
        </div>
      ) : null}
      {!ready && availableUpdate ? <span className="basis-full text-xs text-stone-500 dark:text-gray-400">Exact required download: {formatBytes(availableUpdate.exactTotalBytes)}</span> : null}
      {error ? <span className="max-w-56 text-xs text-red-700 dark:text-red-300">{error}</span> : null}
    </div>
  )
}
