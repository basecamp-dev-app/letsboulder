'use client'

import Image from 'next/image'
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'

import { Button } from '@/components/ui/button'
import type { StoredClimbManifest, StoredCragManifest } from '@/lib/offline/storage'
import { listOfflinePacksForLaunch } from '@/lib/offline/packs'
import { resolveRouteImageUrl } from '@/lib/media/route-image-url'
import { reportError } from '@/lib/errors'

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

function getOfflineThumbnailUrl(url: string | null | undefined) {
  return resolveRouteImageUrl(url)
}

function OfflineLaunchLink({
  href,
  children,
  className,
}: {
  href: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <a href={href} className={className}>
      {children}
    </a>
  )
}

export default function OfflineLibraryClient() {
  const searchParams = useSearchParams()
  const [state, setState] = useState<OfflineLibraryState>({ climbs: [], crags: [] })
  const [status, setStatus] = useState('Loading saved climbs on this device...')
  const [error, setError] = useState<string | null>(null)

  const reason = searchParams.get('reason')
  const reasonMessage = reason === 'weak-signal'
    ? 'Optimizing for offline use due to weak signal.'
    : reason === 'offline'
      ? 'You are offline. Open saved downloads stored on this device.'
      : null

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
        reportError(loadError, { message: 'Failed to load offline library' })
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

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.12),_transparent_32%),linear-gradient(180deg,_#f8fafc_0%,_#eef2f7_100%)] px-4 py-10 text-gray-900 dark:bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.15),_transparent_28%),linear-gradient(180deg,_#020617_0%,_#111827_100%)] dark:text-gray-100">
      <div className="mx-auto max-w-5xl">
        <div className="rounded-3xl border border-white/70 bg-white/90 p-6 shadow-xl shadow-emerald-950/5 backdrop-blur dark:border-white/10 dark:bg-gray-950/80 dark:shadow-black/30">
          <div className="mb-4 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">
            <OfflineLaunchLink href="/offline" className="transition hover:text-gray-900 dark:hover:text-gray-200">
              Offline
            </OfflineLaunchLink>
            <span>/</span>
            <span className="text-gray-700 dark:text-gray-200">Saved downloads</span>
          </div>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-700 dark:text-emerald-300">Offline</p>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight text-gray-950 dark:text-white">Offline library</h1>
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">{status}</p>
              <p className="mt-2 max-w-2xl text-sm text-gray-600 dark:text-gray-300">Saved crags and climbs on this device can launch directly into the route image pages that matter most when you are offline.</p>
            </div>
            <div className="flex gap-3">
              <Button
                asChild
                type="button"
                variant="outline"
                className="rounded-xl border-gray-300 bg-white/80 text-gray-700 shadow-none hover:bg-white dark:border-gray-700 dark:bg-gray-950/70 dark:text-gray-200 dark:hover:bg-gray-900"
              >
                <OfflineLaunchLink href="/offline">Back</OfflineLaunchLink>
              </Button>
              <Button
                asChild
                type="button"
                variant="outline"
                className="rounded-xl border-gray-300 bg-white/80 text-gray-700 shadow-none hover:bg-white dark:border-gray-700 dark:bg-gray-950/70 dark:text-gray-200 dark:hover:bg-gray-900"
              >
                <OfflineLaunchLink href="/">Open live map</OfflineLaunchLink>
              </Button>
            </div>
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-2">
            {reasonMessage ? (
              <div className="md:col-span-2 rounded-2xl border border-cyan-200 bg-cyan-50/80 px-4 py-4 text-sm text-cyan-900 dark:border-cyan-900/60 dark:bg-cyan-950/30 dark:text-cyan-100">
                {reasonMessage}
              </div>
            ) : null}
            <div className="rounded-2xl border border-amber-200 bg-amber-50/80 px-4 py-4 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
              <p className="text-xs font-semibold uppercase tracking-[0.2em]">Crag folders</p>
              <p className="mt-2">Use saved crag pages for context, then launch individual route pages from the climb grid.</p>
            </div>
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 px-4 py-4 text-sm text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-100">
              <p className="text-xs font-semibold uppercase tracking-[0.2em]">Standalone climbs</p>
              <p className="mt-2">Open individually pinned route pages directly from this device.</p>
            </div>
          </div>

          {error ? (
            <div className="mt-8 rounded-2xl border border-red-200 bg-red-50 px-5 py-6 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-100">
              {error}
            </div>
          ) : null}

          {!error && state.crags.length === 0 && standaloneClimbs.length === 0 ? (
            <div className="mt-8 rounded-2xl border border-dashed border-gray-300 bg-gray-50 px-5 py-6 text-sm text-gray-600 dark:border-gray-700 dark:bg-gray-900/70 dark:text-gray-300">
              <p>No saved offline packs found on this device yet.</p>
              <Button asChild type="button" variant="outline" className="mt-4 rounded-xl">
                <OfflineLaunchLink href="/offline">Browse offline options</OfflineLaunchLink>
              </Button>
            </div>
          ) : null}

          {state.crags.length > 0 ? (
            <section className="mt-8 space-y-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-gray-500 dark:text-gray-400">Saved crags</p>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">Open a saved crag for orientation, or use the explicit route-page actions below to jump straight into saved climbs.</p>
              </div>
              <div className="grid gap-5 lg:grid-cols-2">
                {state.crags.map((crag) => {
                  const childClimbs = nestedCragClimbs.get(crag.cragId) || []
                  const coverImageUrl = getOfflineThumbnailUrl(crag.manifest.savedPins?.[0]?.coverImageUrl || null)
                  const launchHref = getOfflineCragLaunchHref(crag)
                  return (
                    <article key={crag.cragId} className="overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
                      <div className="block w-full text-left">
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
                      </div>

                      <div className="space-y-3 p-4">
                        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-100 bg-emerald-50/70 px-4 py-3 dark:border-emerald-900/50 dark:bg-emerald-950/20">
                          <div>
                            <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-100">Start with the saved crag page</p>
                            <p className="mt-1 text-sm text-emerald-800/80 dark:text-emerald-100/80">Open the crag for context, or jump directly to a saved route page below.</p>
                          </div>
                          <Button asChild>
                            <OfflineLaunchLink href={launchHref}>Open crag page</OfflineLaunchLink>
                          </Button>
                        </div>
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                          {childClimbs.map((climb) => (
                            <div
                              key={climb.climbId}
                              className="group overflow-hidden rounded-2xl border border-gray-200 bg-gray-50 text-left transition hover:border-gray-300 hover:bg-white dark:border-gray-800 dark:bg-gray-950 dark:hover:border-gray-700 dark:hover:bg-gray-900"
                            >
                              <div className="relative aspect-[4/3] bg-gray-200 dark:bg-gray-800">
                                {getOfflineThumbnailUrl(climb.manifest.coverImageUrl) ? (
                                  <Image src={getOfflineThumbnailUrl(climb.manifest.coverImageUrl)} alt={climb.manifest.climbName} fill className="object-cover transition duration-200 group-hover:scale-[1.02]" sizes="(max-width: 768px) 50vw, 20vw" unoptimized />
                                ) : null}
                              </div>
                              <div className="space-y-3 p-3">
                                <p className="line-clamp-2 text-sm font-semibold text-gray-900 dark:text-gray-100">{climb.manifest.climbName}</p>
                                <Button asChild size="sm" className="w-full rounded-xl">
                                  <OfflineLaunchLink href={getOfflineClimbLaunchHref(climb)}>Open route page</OfflineLaunchLink>
                                </Button>
                              </div>
                            </div>
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
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">These saved route pages stay available even if you later remove a crag pack.</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {standaloneClimbs.map((climb) => {
                  return (
                    <div
                      key={climb.climbId}
                      className="group overflow-hidden rounded-3xl border border-gray-200 bg-white text-left shadow-sm transition hover:-translate-y-0.5 hover:border-gray-300 dark:border-gray-800 dark:bg-gray-900 dark:hover:border-gray-700"
                    >
                      <div className="relative aspect-[4/3] bg-gray-200 dark:bg-gray-800">
                        {getOfflineThumbnailUrl(climb.manifest.coverImageUrl) ? (
                          <Image src={getOfflineThumbnailUrl(climb.manifest.coverImageUrl)} alt={climb.manifest.climbName} fill className="object-cover transition duration-200 group-hover:scale-[1.02]" sizes="(max-width: 768px) 100vw, 33vw" unoptimized />
                        ) : null}
                      </div>
                      <div className="space-y-2 p-4">
                        <p className="text-base font-semibold text-gray-900 dark:text-gray-100">{climb.manifest.climbName}</p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">{climb.manifest.mediaCount} photo{climb.manifest.mediaCount === 1 ? '' : 's'} · {formatBytes(climb.manifest.estimatedBytes)}</p>
                        <p className="text-xs uppercase tracking-wide text-emerald-700 dark:text-emerald-300">{climb.ownerPackIds.length > 1 ? 'Shared across packs' : 'Saved directly'}</p>
                        <Button asChild size="sm" className="w-full rounded-xl">
                          <OfflineLaunchLink href={getOfflineClimbLaunchHref(climb)}>Open route page</OfflineLaunchLink>
                        </Button>
                      </div>
                    </div>
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
