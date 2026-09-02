'use client'
/* eslint-disable @next/next/no-html-link-for-pages -- Standalone offline routes require service-worker-controlled document navigations. */

import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { ArrowLeft, MapPin, Mountain, RefreshCw, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { useConnectivity } from '@/features/offline/hooks/use-connectivity'
import { useOfflinePacks } from '@/features/offline/hooks/use-offline-packs'
import { readOfflineCragPayload } from '@/features/offline/lib/offline-crag-reader'
import { OfflinePackManager } from '@/features/offline/lib/offline-pack-manager'
import type { ActiveOfflinePack } from '@/features/offline/lib/offline-pack-types'
import type { CragPackManifest } from '@/types/crag-pack-manifest'
import type { RoutePoint } from '@/types/domain'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const packReader = new OfflinePackManager()

interface TopoRoute {
  id: string
  name: string
  grade: string
  color: string
  points: RoutePoint[]
}

interface TopoImage {
  id: string
  url: string
  label: string
  width: number
  height: number
  routes: TopoRoute[]
}

function parsePoints(value: unknown): RoutePoint[] {
  let parsed = value
  if (typeof value === 'string') {
    try { parsed = JSON.parse(value) as unknown } catch { return [] }
  }
  if (!Array.isArray(parsed)) return []
  return parsed.filter((point): point is RoutePoint => (
    typeof point === 'object' && point !== null
    && typeof (point as { x?: unknown }).x === 'number'
    && typeof (point as { y?: unknown }).y === 'number'
  ))
}

function collectTopos(manifest: CragPackManifest): TopoImage[] {
  const climbs = new Map(manifest.metadata.climbs.map((climb) => [climb.id, climb]))
  return manifest.metadata.images.flatMap((image) => {
    const asset = manifest.assets.find((candidate) => candidate.imageId === image.id && candidate.variant === 'topo')
      || manifest.assets.find((candidate) => candidate.imageId === image.id && candidate.variant === 'detail')
    if (!asset) return []
    const imageLines = manifest.metadata.routeLines.filter((line) => line.imageId === image.id)
    const width = imageLines.find((line) => line.imageWidth)?.imageWidth || image.width || asset.width
    const height = imageLines.find((line) => line.imageHeight)?.imageHeight || image.height || asset.height
    const routes = imageLines.map((line) => {
      const climb = climbs.get(line.climbId)
      const storedPoints = parsePoints(line.points)
      const normalized = storedPoints.length > 0 && storedPoints.every((point) => point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1)
      return {
        id: line.id,
        name: climb?.name || 'Unnamed route',
        grade: climb?.consensusGrade || climb?.grade || 'Unknown grade',
        color: line.color || '#10b981',
        points: normalized ? storedPoints.map((point) => ({ x: point.x * width, y: point.y * height })) : storedPoints,
      }
    })
    return [{
      id: image.id,
      url: asset.url,
      label: `${manifest.cragName} topo`,
      width,
      height,
      routes,
    }]
  })
}

function TopoFigure({ topo }: { topo: TopoImage }) {
  return (
    <figure className="overflow-hidden rounded-3xl border border-stone-200 bg-stone-950 shadow-sm dark:border-gray-800">
      <div className="relative">
        {/* Packed URLs are exact immutable assets; generated Next Image variants are not available offline. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={topo.url} alt={topo.label} className="block h-auto w-full" />
        <svg className="pointer-events-none absolute inset-0 size-full" viewBox={`0 0 ${topo.width} ${topo.height}`} role="img" aria-label={`Route lines on ${topo.label}`} preserveAspectRatio="xMidYMid meet">
          {topo.routes.map((route) => route.points.length > 1 ? (
            <g key={route.id}>
              <polyline points={route.points.map((point) => `${point.x},${point.y}`).join(' ')} fill="none" stroke="rgba(0,0,0,0.65)" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" />
              <polyline points={route.points.map((point) => `${point.x},${point.y}`).join(' ')} fill="none" stroke={route.color} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx={route.points[0]?.x} cy={route.points[0]?.y} r="11" fill={route.color} stroke="white" strokeWidth="4" />
            </g>
          ) : null)}
        </svg>
      </div>
      <figcaption className="flex flex-wrap gap-2 p-4 text-xs text-white">
        {topo.routes.length === 0 ? <span className="text-stone-300">Topo image</span> : topo.routes.map((route) => <span key={route.id} className="rounded-full bg-white/10 px-3 py-1.5"><span className="font-semibold">{route.name}</span> · {route.grade}</span>)}
      </figcaption>
    </figure>
  )
}

export default function OfflineCragViewer() {
  const { repair, update, remove, loading } = useOfflinePacks()
  const { status: connectivity } = useConnectivity()
  const connected = connectivity === 'online'
  const searchParams = useSearchParams()
  const cragId = searchParams.get('id') || ''
  const validCragId = UUID_PATTERN.test(cragId)
  const [activePack, setActivePack] = useState<ActiveOfflinePack | null | undefined>(undefined)
  const [readError, setReadError] = useState(false)
  const [missingUrls, setMissingUrls] = useState<string[]>([])
  const [verifiedForOpen, setVerifiedForOpen] = useState(false)

  const readActivePack = useCallback(async () => {
    const packs = await packReader.list()
    const pack = packs.find((candidate) => candidate.kind === 'crag' && candidate.entityId === cragId
      && candidate.activeVersion !== null && candidate.status !== 'unsupported')
    return pack ? packReader.validateActive(pack.packId) : null
  }, [cragId])

  useEffect(() => {
    let active = true
    if (!validCragId) return () => { active = false }
    void readActivePack()
      .then((validation) => {
        if (!active) return
        const failures = validation ? [...validation.missingUrls, ...(validation.corruptUrls ?? [])] : []
        setMissingUrls(failures)
        setVerifiedForOpen(Boolean(validation) && failures.length === 0 && validation?.active.version.source !== 'legacy')
        setActivePack(validation?.active ?? null)
      })
      .catch(() => { if (active) setReadError(true) })
    return () => { active = false }
  }, [readActivePack, validCragId])

  useEffect(() => {
    if (!activePack || !verifiedForOpen || !readOfflineCragPayload(activePack.version.manifest.payload)) return
    void packReader.markOpened(activePack.pack.packId)
  }, [activePack, verifiedForOpen])

  if (validCragId && activePack === undefined && !readError) {
    return <main id="main-content" aria-live="polite" className="min-h-screen bg-stone-100 p-8 text-stone-700 dark:bg-gray-950 dark:text-gray-300">Reading saved crag...</main>
  }

  const payload = activePack?.version.manifest.payload
  const manifest = readOfflineCragPayload(payload)
  if (!validCragId || !manifest || readError) {
    const incompatible = activePack !== null && activePack !== undefined && !manifest
    const title = readError ? 'Unable to read saved guides' : incompatible ? 'Saved guide needs attention' : 'Saved crag not found'
    const explanation = readError
      ? 'Browser storage could not be read. Reload this screen or return to the library and try again.'
      : incompatible
        ? 'This download is incomplete or uses an older format. Update it while online, or remove it and download it again.'
        : 'This crag is not available in the offline library on this device.'
    const recover = async () => {
      if (!activePack) return
      await update(activePack.pack.packId)
      const validation = await readActivePack()
      const failures = validation ? [...validation.missingUrls, ...(validation.corruptUrls ?? [])] : []
      setMissingUrls(failures)
      setVerifiedForOpen(Boolean(validation) && failures.length === 0 && validation?.active.version.source !== 'legacy')
      setActivePack(validation?.active ?? null)
    }
    const removeBroken = async () => {
      if (!activePack || !globalThis.confirm(`Remove ${activePack.pack.displayName} from this device?`)) return
      await remove(activePack.pack.packId)
      setActivePack(null)
    }
    return (
      <main id="main-content" className="min-h-screen bg-stone-100 px-4 py-12 dark:bg-gray-950">
        <div role={readError || incompatible ? 'alert' : undefined} className="mx-auto max-w-lg rounded-3xl border border-stone-200 bg-white p-7 text-stone-950 shadow-sm dark:border-gray-800 dark:bg-gray-900 dark:text-white">
          <Mountain aria-hidden="true" className="text-emerald-700 dark:text-emerald-300" /><h1 className="mt-4 text-2xl font-semibold">{title}</h1>
          <p className="mt-2 text-sm leading-6 text-stone-600 dark:text-gray-300">{explanation}</p>
          <div className="mt-6 flex flex-wrap gap-2">
            <Button asChild className="rounded-xl"><a href="/offline/library">Back to offline library</a></Button>
            {connected ? <Button asChild variant="outline" className="rounded-xl"><a href="/">Return to online app</a></Button> : null}
            {incompatible ? <Button type="button" variant="outline" className="rounded-xl" disabled={loading || !connected} onClick={() => void recover()}><RefreshCw aria-hidden="true" /> Update guide</Button> : null}
            {incompatible ? <Button type="button" variant="ghost" className="rounded-xl text-red-700 dark:text-red-300" disabled={loading} onClick={() => void removeBroken()}><Trash2 aria-hidden="true" /> Remove download</Button> : null}
          </div>
        </div>
      </main>
    )
  }

  const topos = collectTopos(manifest)
  const availableTopos = topos.filter((topo) => !missingUrls.some((missingUrl) => (
    missingUrl === topo.url || new URL(topo.url, missingUrl).href === missingUrl
  )))
  const pins = manifest.metadata.climbs.filter((climb) => climb.coordinates.latitude !== null && climb.coordinates.longitude !== null)
  const sectorNames = new Map((manifest.metadata.sectors ?? []).map((sector) => [sector.id, sector.name]))
  const climbsWithTopos = new Set(manifest.metadata.routeLines.map((line) => line.climbId))
  const crag = manifest.metadata.crag
  const cragLatitude = crag.coordinates?.latitude
  const cragLongitude = crag.coordinates?.longitude

  return (
    <main id="main-content" className="min-h-screen bg-stone-100 px-4 py-6 text-stone-950 dark:bg-gray-950 dark:text-gray-50 sm:py-10">
      <div className="mx-auto max-w-5xl">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <Button asChild variant="ghost" className="rounded-xl"><a href="/offline/library"><ArrowLeft aria-hidden="true" /> Library</a></Button>
          {connected ? (
            <Button asChild variant="outline" className="rounded-xl"><a href="/">Return to online app</a></Button>
          ) : (
            <Button type="button" variant="outline" className="rounded-xl" disabled>Reconnect for online app</Button>
          )}
        </div>
        <header className="rounded-3xl bg-emerald-950 p-6 text-white sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-200">Saved field guide</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">{manifest.metadata.crag.name}</h1>
          <p className="mt-3 text-sm text-emerald-50/80">{manifest.metadata.climbs.length} {manifest.metadata.climbs.length === 1 ? 'route' : 'routes'} · {topos.length} topo {topos.length === 1 ? 'image' : 'images'}</p>
          {manifest.metadata.crag.description ? <p className="mt-4 max-w-2xl text-sm leading-6 text-emerald-50/80">{manifest.metadata.crag.description}</p> : null}
          <dl className="mt-5 grid gap-3 text-sm text-emerald-50/90 sm:grid-cols-2">
            <div><dt className="font-semibold text-emerald-200">Location</dt><dd>{[crag.subArea, crag.regionName, crag.country].filter(Boolean).join(', ')}</dd></div>
            <div><dt className="font-semibold text-emerald-200">Rock</dt><dd>{crag.rockType || 'Not recorded'}</dd></div>
            {crag.accessNotes ? <div><dt className="font-semibold text-emerald-200">Access</dt><dd>{crag.accessNotes}</dd></div> : null}
            {crag.tideDependency ? <div><dt className="font-semibold text-emerald-200">Tide</dt><dd>{crag.tideDependency}</dd></div> : null}
            {typeof cragLatitude === 'number' && typeof cragLongitude === 'number' ? <div><dt className="font-semibold text-emerald-200">Crag coordinates</dt><dd className="font-mono text-xs">Crag: {cragLatitude.toFixed(5)}, {cragLongitude.toFixed(5)}</dd></div> : null}
          </dl>
        </header>

        {missingUrls.length > 0 ? (
          <div role="alert" className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
            <p className="font-semibold">Some saved media is missing</p>
            <p className="mt-1">The guide details and pins are still available. Repair the guide when you have a connection to redownload {missingUrls.length === 1 ? 'the missing asset' : 'the missing assets'}.</p>
            <Button type="button" variant="outline" disabled={loading || !connected} onClick={() => void repair(activePack?.pack.packId ?? '')} className="mt-3 rounded-xl border-amber-300 bg-transparent">{loading ? 'Repairing...' : connected ? 'Repair guide' : 'Reconnect to repair'}</Button>
          </div>
        ) : null}

        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_19rem]">
          <section aria-labelledby="topos-heading"><h2 id="topos-heading" className="text-xl font-semibold">Topos</h2>
            {availableTopos.length > 0 ? <div className="mt-3 space-y-5">{availableTopos.map((topo) => <TopoFigure key={topo.id} topo={topo} />)}</div> : <p className="mt-3 rounded-2xl bg-white p-5 text-sm text-stone-600 dark:bg-gray-900 dark:text-gray-300">No cached topo images are available.</p>}
          </section>

          <aside className="space-y-5">
            <section aria-labelledby="routes-heading" className="rounded-3xl border border-stone-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
              <h2 id="routes-heading" className="font-semibold">Route details</h2><ul className="mt-3 divide-y divide-stone-200 dark:divide-gray-800">
                {manifest.metadata.climbs.map((route) => <li key={route.id} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex items-start justify-between gap-3"><h3 className="font-medium">{route.name || 'Unnamed route'}</h3><span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">{route.consensusGrade || route.grade}</span></div>
                  <p className="mt-1 text-xs text-stone-500 dark:text-gray-400">{[route.sectorId ? sectorNames.get(route.sectorId) : null, route.routeType].filter(Boolean).join(' · ')}</p>
                  {route.description ? <p className="mt-2 text-sm leading-5 text-stone-600 dark:text-gray-300">{route.description}</p> : null}
                  {!climbsWithTopos.has(route.id) ? <p className="mt-2 text-xs font-medium text-amber-700 dark:text-amber-300">No public topo is available; this climb is saved as text only.</p> : null}
                </li>)}
              </ul>
            </section>
            <section aria-labelledby="pins-heading" className="rounded-3xl border border-stone-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
              <div className="flex items-center gap-2"><MapPin aria-hidden="true" className="size-4 text-emerald-700 dark:text-emerald-300" /><h2 id="pins-heading" className="font-semibold">Pins-only context</h2></div><p className="mt-2 text-xs leading-5 text-stone-500 dark:text-gray-400">Saved coordinates without a live basemap.</p>
              {pins.length > 0 ? <ol className="mt-3 space-y-2">{pins.map((pin, index) => <li key={pin.id} className="rounded-2xl bg-stone-100 p-3 dark:bg-gray-800"><p className="text-sm font-medium">{index + 1}. {pin.name || 'Unnamed route'}</p><p className="mt-1 font-mono text-[11px] text-stone-500 dark:text-gray-400">{pin.coordinates.latitude?.toFixed(5)}, {pin.coordinates.longitude?.toFixed(5)}</p></li>)}</ol> : <p className="mt-3 text-sm text-stone-600 dark:text-gray-300">No route coordinates were saved with this pack.</p>}
            </section>
          </aside>
        </div>
      </div>
    </main>
  )
}
