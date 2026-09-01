'use client'
/* eslint-disable @next/next/no-html-link-for-pages -- Standalone offline routes require service-worker-controlled document navigations. */

import { MapPinned, Mountain, RefreshCw, Trash2, Wifi, WifiOff } from 'lucide-react'
import { useEffect } from 'react'

import { Button } from '@/components/ui/button'
import { useConnectivity } from '@/features/offline/hooks/use-connectivity'
import { useOfflinePacks } from '@/features/offline/hooks/use-offline-packs'

export default function OfflineLibraryView() {
  const { packs, loading, error, update, repair, remove, discardFailed, resume } = useOfflinePacks()
  const { status: connectivity } = useConnectivity()
  const connected = connectivity === 'online'

  useEffect(() => {
    void resume().catch(() => undefined)
  }, [resume])

  const handleUpdate = async (packId: string, displayName: string) => {
    if (!globalThis.confirm(`Check for and download updates to ${displayName}?`)) return
    await update(packId).catch(() => undefined)
  }

  const handleRemove = async (packId: string, displayName: string) => {
    if (!globalThis.confirm(`Remove ${displayName} from this device?`)) return
    await remove(packId).catch(() => undefined)
  }

  const handleDiscardFailed = async (packId: string, displayName: string) => {
    if (!globalThis.confirm(`Discard the failed download for ${displayName} and remove its partial media?`)) return
    await discardFailed(packId).catch(() => undefined)
  }

  const handleRepair = async (packId: string, displayName: string) => {
    if (!globalThis.confirm(`Redownload missing media for ${displayName}?`)) return
    await repair(packId).catch(() => undefined)
  }

  return (
    <main id="main-content" className="min-h-screen bg-stone-100 px-4 py-8 text-stone-950 dark:bg-gray-950 dark:text-gray-50 sm:py-12">
      <div className="mx-auto max-w-4xl">
        <div className="mb-5 flex justify-end">
          {connected ? (
            <Button asChild variant="outline" className="rounded-xl"><a href="/">Return to online app</a></Button>
          ) : (
            <Button type="button" variant="outline" className="rounded-xl" disabled>Reconnect for online app</Button>
          )}
        </div>

        <header className="rounded-3xl bg-emerald-950 p-6 text-white shadow-xl shadow-emerald-950/15 sm:p-8">
          <div className="flex size-11 items-center justify-center rounded-2xl bg-emerald-300 text-emerald-950"><MapPinned aria-hidden="true" /></div>
          <p className="mt-5 text-xs font-semibold uppercase tracking-[0.22em] text-emerald-200">On this device</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Offline library</h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-emerald-50/80">Open saved crags and routes without a signal. Content reflects the last successful install on this device.</p>
        </header>

        <div role="status" className={`mt-4 flex items-center gap-2 rounded-2xl border px-4 py-3 text-sm ${connected ? 'border-emerald-200 bg-emerald-50 text-emerald-950 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-100' : 'border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100'}`}>
          {connected ? <Wifi aria-hidden="true" className="size-4" /> : <WifiOff aria-hidden="true" className="size-4" />}
          {connectivity === 'checking' ? 'Checking connection…' : connected ? 'Online — updates and repairs are available.' : 'Offline — saved guides can still be opened.'}
        </div>

        <section aria-labelledby="saved-guides-heading" className="mt-6">
          <h2 id="saved-guides-heading" className="sr-only">Saved guides</h2>
          {error ? <div role="alert" className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-900 dark:border-red-900 dark:bg-red-950/30 dark:text-red-100">{error}</div> : null}
          {loading && packs.length === 0 ? (
            <div aria-live="polite" className="rounded-2xl border border-stone-200 bg-white p-6 text-sm text-stone-600 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300">Reading saved guides...</div>
          ) : packs.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-stone-300 bg-white p-8 text-center dark:border-gray-700 dark:bg-gray-900">
              <Mountain className="mx-auto text-stone-400" aria-hidden="true" />
              <h2 className="mt-4 text-lg font-semibold">No guides saved yet</h2>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-stone-600 dark:text-gray-300">Save a crag while connected and it will appear here for field use.</p>
            </div>
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2">
              {packs.map((pack) => {
                const usable = pack.activeVersion !== null && pack.status !== 'error'
                return (
                  <li key={pack.packId} className="overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
                    <div className="flex h-28 items-center justify-center bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300">
                       <Mountain aria-hidden="true" />
                    </div>
                    <div className="p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div><p className="text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">{pack.kind}</p><h2 className="mt-1 text-lg font-semibold">{pack.displayName}</h2></div>
                         <span className="rounded-full bg-stone-100 px-2.5 py-1 text-xs capitalize text-stone-600 dark:bg-gray-800 dark:text-gray-300">{pack.status === 'degraded' ? 'Needs repair' : pack.status}</span>
                      </div>
                       <p className="mt-3 text-xs text-stone-500 dark:text-gray-400">{usable ? (pack.error ? `Update failed: ${pack.error}` : `Last successful update ${pack.lastSuccessfulUpdateAt ? new Date(pack.lastSuccessfulUpdateAt).toLocaleDateString() : pack.installedAt ? new Date(pack.installedAt).toLocaleDateString() : 'on this device'}`) : pack.status === 'installing' ? 'Downloading guide...' : pack.error || 'Download failed'}</p>
                       {pack.kind === 'crag' && usable ? (
                        <Button asChild className="mt-5 w-full rounded-xl"><a href={`/offline/crag?id=${encodeURIComponent(pack.entityId)}`}>Open saved crag</a></Button>
                      ) : (
                         <Button className="mt-5 w-full rounded-xl" disabled>Not ready</Button>
                       )}
                       {usable ? (
                         <div className="mt-2 grid grid-cols-2 gap-2">
                           <Button type="button" variant="outline" disabled={loading || !connected} onClick={() => void (pack.status === 'degraded' ? handleRepair(pack.packId, pack.displayName) : handleUpdate(pack.packId, pack.displayName))} className="rounded-xl"><RefreshCw aria-hidden="true" /> {pack.status === 'degraded' ? 'Repair' : 'Update'}</Button>
                          <Button type="button" variant="ghost" disabled={loading} onClick={() => void handleRemove(pack.packId, pack.displayName)} className="rounded-xl text-red-700 hover:text-red-800 dark:text-red-300"><Trash2 aria-hidden="true" /> Remove</Button>
                        </div>
                       ) : pack.error !== null ? (
                        <Button type="button" variant="outline" disabled={loading} onClick={() => void handleDiscardFailed(pack.packId, pack.displayName)} className="mt-5 w-full rounded-xl text-red-700 dark:text-red-300"><Trash2 aria-hidden="true" /> Discard failed download</Button>
                      ) : null}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </div>
    </main>
  )
}
