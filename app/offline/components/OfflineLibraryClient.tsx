'use client'

import Image from 'next/image'
import { useEffect, useMemo, useState } from 'react'
import type { StoredClimbManifest, StoredCragManifest } from '@/lib/offline/storage'
import { listOfflinePacksForLaunch } from '@/lib/offline/packs'

function getOfflineClimbLaunchHref(climb: StoredClimbManifest) {
  return `/climb/${climb.climbId}`
}

function getOfflineCragLaunchHref(crag: StoredCragManifest) {
  return `/crag/${crag.cragId}`
}

interface OfflineLibraryState {
  climbs: StoredClimbManifest[]
  crags: StoredCragManifest[]
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 MB'
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function OfflineLibraryClient() {
  const [state, setState] = useState<OfflineLibraryState>({ climbs: [], crags: [] })
  const [status, setStatus] = useState('Loading saved climbs on this device...')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const launch = await listOfflinePacksForLaunch()
        if (cancelled) return

        const crags = launch.crags
        const climbs = launch.climbs
        const standaloneCount = climbs.filter((entry) => entry.pinnedStandalone).length
        setState({ climbs, crags })
        setStatus(
          crags.length + standaloneCount === 0
            ? 'No saved offline packs found on this device yet.'
            : `${crags.length + standaloneCount} saved offline pack${crags.length + standaloneCount === 1 ? '' : 's'} ready to open.`
        )
        setError(null)
      } catch (loadError) {
        console.error('Failed to load offline library:', loadError)
        if (cancelled) return
        setError('Unable to read offline storage on this device.')
        setStatus('Unable to load saved offline packs right now.')
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [])

  const standaloneClimbs = useMemo(
    () => state.climbs.filter((entry) => entry.pinnedStandalone),
    [state.climbs]
  )

  const nestedCragClimbs = useMemo(() => {
    const grouped = new Map<string, StoredClimbManifest[]>()
    for (const crag of state.crags) {
      const entries = state.climbs
        .filter((climb) => climb.ownerPackIds.includes(crag.manifest.packId))
        .sort((a, b) => a.manifest.climbName.localeCompare(b.manifest.climbName))
      grouped.set(crag.cragId, entries)
    }
    return grouped
  }, [state.climbs, state.crags])

  const openOfflineHref = (href: string) => {
    window.location.assign(href)
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.12),_transparent_32%),linear-gradient(180deg,_#f8fafc_0%,_#eef2f7_100%)] px-4 py-10 text-gray-900 dark:bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.15),_transparent_28%),linear-gradient(180deg,_#020617_0%,_#111827_100%)] dark:text-gray-100">
      <div className="mx-auto max-w-5xl">
        <div className="rounded-3xl border border-white/70 bg-white/90 p-6 shadow-xl shadow-emerald-950/5 backdrop-blur dark:border-white/10 dark:bg-gray-950/80 dark:shadow-black/30">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-700 dark:text-emerald-300">Offline</p>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight text-gray-950 dark:text-white">Offline library</h1>
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">{status}</p>
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => window.location.assign('/offline')}
                className="inline-flex items-center rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
              >
                Back
              </button>
              <button
                type="button"
                onClick={() => window.location.assign('/')}
                className="inline-flex items-center rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
              >
                Open map
              </button>
            </div>
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-2">
            <div className="rounded-2xl border border-amber-200 bg-amber-50/80 px-4 py-4 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
              <p className="text-xs font-semibold uppercase tracking-[0.2em]">Crag folders</p>
              <p className="mt-2">Browse saved crags by thumbnail, then open individual climb pages.</p>
            </div>
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 px-4 py-4 text-sm text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-100">
              <p className="text-xs font-semibold uppercase tracking-[0.2em]">Standalone climbs</p>
              <p className="mt-2">Open individually pinned climbs directly from this device.</p>
            </div>
          </div>

          {error ? (
            <div className="mt-8 rounded-2xl border border-red-200 bg-red-50 px-5 py-6 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-100">
              {error}
            </div>
          ) : null}

          {!error && state.crags.length === 0 && standaloneClimbs.length === 0 ? (
            <div className="mt-8 rounded-2xl border border-dashed border-gray-300 bg-gray-50 px-5 py-6 text-sm text-gray-600 dark:border-gray-700 dark:bg-gray-900/70 dark:text-gray-300">
              No saved offline packs found on this device yet.
            </div>
          ) : null}

          {state.crags.length > 0 ? (
            <section className="mt-8 space-y-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-gray-500 dark:text-gray-400">Saved crags</p>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">Open a saved crag and use the topo thumbnails to jump straight to the climb page.</p>
              </div>
              <div className="grid gap-5 lg:grid-cols-2">
                {state.crags.map((crag) => {
                  const childClimbs = nestedCragClimbs.get(crag.cragId) || []
                  const coverImageUrl = crag.manifest.savedPins?.[0]?.coverImageUrl || null
                  const launchHref = getOfflineCragLaunchHref(crag)
                  return (
                    <article key={crag.cragId} className="overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
                      <button type="button" onClick={() => openOfflineHref(launchHref)} className="block w-full text-left">
                        <div className="relative aspect-[16/8] bg-gray-200 dark:bg-gray-800">
                          {coverImageUrl ? (
                            <Image src={coverImageUrl} alt={`${crag.manifest.cragName} cover`} fill className="object-cover" sizes="(max-width: 1024px) 100vw, 50vw" unoptimized />
                          ) : (
                            <div className="flex h-full items-center justify-center text-sm text-gray-500 dark:text-gray-400">Saved crag</div>
                          )}
                          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent px-4 py-4 text-white">
                            <p className="text-lg font-semibold">{crag.manifest.cragName}</p>
                            <p className="mt-1 text-xs text-white/80">{childClimbs.length} saved climb{childClimbs.length === 1 ? '' : 's'} · {formatBytes(crag.manifest.estimatedBytes)}</p>
                          </div>
                        </div>
                      </button>

                      <div className="space-y-3 p-4">
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                          {childClimbs.map((climb) => (
                            <a key={climb.climbId} href={getOfflineClimbLaunchHref(climb)} className="group overflow-hidden rounded-2xl border border-gray-200 bg-gray-50 transition hover:border-gray-300 hover:bg-white dark:border-gray-800 dark:bg-gray-950 dark:hover:border-gray-700 dark:hover:bg-gray-900">
                              <div className="aspect-[4/3] bg-gray-200 dark:bg-gray-800">
                                {climb.manifest.coverImageUrl ? (
                                  <Image src={climb.manifest.coverImageUrl} alt={climb.manifest.climbName} fill className="object-cover transition duration-200 group-hover:scale-[1.02]" sizes="(max-width: 768px) 50vw, 20vw" unoptimized />
                                ) : null}
                              </div>
                              <div className="p-3">
                                <p className="line-clamp-2 text-sm font-semibold text-gray-900 dark:text-gray-100">{climb.manifest.climbName}</p>
                              </div>
                            </a>
                          ))}
                        </div>
                      </div>
                    </article>
                  )
                })}
              </div>
            </section>
          ) : null}

          {standaloneClimbs.length > 0 ? (
            <section className="mt-8 space-y-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-gray-500 dark:text-gray-400">Standalone climbs</p>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">These climbs stay available even if you later remove a crag pack.</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {standaloneClimbs.map((climb) => {
                  return (
                    <a key={climb.climbId} href={getOfflineClimbLaunchHref(climb)} className="group overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-gray-300 dark:border-gray-800 dark:bg-gray-900 dark:hover:border-gray-700">
                      <div className="aspect-[4/3] bg-gray-200 dark:bg-gray-800">
                        {climb.manifest.coverImageUrl ? (
                          <Image src={climb.manifest.coverImageUrl} alt={climb.manifest.climbName} fill className="object-cover transition duration-200 group-hover:scale-[1.02]" sizes="(max-width: 768px) 100vw, 33vw" unoptimized />
                        ) : null}
                      </div>
                      <div className="space-y-2 p-4">
                        <p className="text-base font-semibold text-gray-900 dark:text-gray-100">{climb.manifest.climbName}</p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">{climb.manifest.mediaCount} photo{climb.manifest.mediaCount === 1 ? '' : 's'} · {formatBytes(climb.manifest.estimatedBytes)}</p>
                        <p className="text-xs uppercase tracking-wide text-emerald-700 dark:text-emerald-300">{climb.ownerPackIds.length > 1 ? 'Shared across packs' : 'Saved directly'}</p>
                      </div>
                    </a>
                  )
                })}
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  )
}
