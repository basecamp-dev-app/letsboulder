import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import OfflineCragViewer from '@/features/offline/components/OfflineCragViewer'
import OfflineLibraryView from '@/features/offline/components/OfflineLibraryView'

const CRAG_ID = '123e4567-e89b-42d3-a456-426614174000'
const { getActiveMock, listMock, useConnectivityMock, useOfflinePacksMock } = vi.hoisted(() => ({
  getActiveMock: vi.fn(),
  listMock: vi.fn(),
  useConnectivityMock: vi.fn(),
  useOfflinePacksMock: vi.fn(),
}))

vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(`id=${CRAG_ID}`) }))
vi.mock('@/features/offline/hooks/use-connectivity', () => ({ useConnectivity: useConnectivityMock }))
vi.mock('@/features/offline/hooks/use-offline-packs', () => ({ useOfflinePacks: useOfflinePacksMock }))
vi.mock('@/features/offline/lib/offline-pack-manager', () => ({
  OfflinePackManager: class {
    list = listMock
    getActive = getActiveMock
    validateActive = vi.fn(async (packId: string) => {
      const active = await getActiveMock(packId)
      return active ? { active, missingUrls: [] } : null
    })
  },
}))

describe('offline standalone views', () => {
  beforeEach(() => {
    useConnectivityMock.mockReturnValue({ status: 'online', check: vi.fn() })
    useOfflinePacksMock.mockReturnValue({ loading: false, packs: [], error: null, repair: vi.fn(), resume: vi.fn(async () => undefined) })
    listMock.mockResolvedValue([])
    getActiveMock.mockResolvedValue(null)
  })

  it('links ready crags to the generic offline viewer', async () => {
    useOfflinePacksMock.mockReturnValue({
      loading: false,
      error: null,
      repair: vi.fn(),
      resume: vi.fn(async () => undefined),
      packs: [{ packId: 'crag-pack', kind: 'crag', entityId: CRAG_ID, displayName: 'Cobo Bay', manifestUrl: '/pack.json', activeVersion: 'v1', status: 'ready', installedAt: '2026-07-29T10:00:00.000Z', updatedAt: '2026-07-29T10:00:00.000Z', error: null }],
    })

    render(<OfflineLibraryView />)

    expect(await screen.findByRole('heading', { name: 'Cobo Bay' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open saved crag' })).toHaveAttribute('href', `/offline/crag?id=${CRAG_ID}`)
  })

  it('keeps saved guides available while the connection check is offline', async () => {
    useConnectivityMock.mockReturnValue({ status: 'offline', check: vi.fn() })
    useOfflinePacksMock.mockReturnValue({
      loading: false,
      error: null,
      repair: vi.fn(),
      resume: vi.fn(async () => undefined),
      packs: [{ packId: 'crag-pack', kind: 'crag', entityId: CRAG_ID, displayName: 'Cobo Bay', manifestUrl: '/pack.json', activeVersion: 'v1', status: 'ready', installedAt: '2026-07-29T10:00:00.000Z', updatedAt: '2026-07-29T10:00:00.000Z', error: null }],
    })

    render(<OfflineLibraryView />)

    expect(await screen.findByRole('link', { name: 'Open saved crag' })).toBeVisible()
    expect(screen.queryByRole('link', { name: 'Connection status' })).not.toBeInTheDocument()
  })

  it('shows loading and empty library states', () => {
    useOfflinePacksMock.mockReturnValue({ loading: true, packs: [], error: null, repair: vi.fn(), resume: vi.fn(async () => undefined) })
    const { rerender } = render(<OfflineLibraryView />)
    expect(screen.getByText('Reading saved guides...')).toBeInTheDocument()

    useOfflinePacksMock.mockReturnValue({ loading: false, packs: [], error: null, repair: vi.fn(), resume: vi.fn(async () => undefined) })
    rerender(<OfflineLibraryView />)
    expect(screen.getByRole('heading', { name: 'No guides saved yet' })).toBeInTheDocument()
  })

  it('provides recovery navigation when the requested crag is not installed', async () => {
    render(<OfflineCragViewer />)

    expect(await screen.findByRole('heading', { name: 'Saved crag not found' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to offline library' })).toHaveAttribute('href', '/offline/library')
    expect(screen.getByRole('link', { name: 'Return to online app' })).toHaveAttribute('href', '/')
  })

  it('shows degraded packs with repair and failed updates without hiding the active viewer', () => {
    useOfflinePacksMock.mockReturnValue({
      loading: false, error: null, repair: vi.fn(), update: vi.fn(), remove: vi.fn(), discardFailed: vi.fn(), resume: vi.fn(async () => undefined),
      packs: [{ packId: 'crag-pack', kind: 'crag', entityId: CRAG_ID, displayName: 'Cobo Bay', manifestUrl: '/pack.json', activeVersion: 'v1', status: 'degraded', installedAt: null, updatedAt: 'now', error: 'media missing' }],
    })
    render(<OfflineLibraryView />)
    expect(screen.getByRole('link', { name: 'Open saved crag' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /repair/i })).toBeInTheDocument()
    expect(screen.getByText('Needs repair')).toBeInTheDocument()
  })

  it('offers discard for a failed initial download', () => {
    useOfflinePacksMock.mockReturnValue({
      loading: false, error: null, repair: vi.fn(), update: vi.fn(), remove: vi.fn(), discardFailed: vi.fn(), resume: vi.fn(async () => undefined),
      packs: [{ packId: 'crag-pack', kind: 'crag', entityId: CRAG_ID, displayName: 'Cobo Bay', manifestUrl: '/pack.json', activeVersion: null, status: 'error', installedAt: null, updatedAt: 'now', error: 'network interrupted' }],
    })
    render(<OfflineLibraryView />)
    expect(screen.getByRole('button', { name: /discard failed download/i })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Open saved crag' })).not.toBeInTheDocument()
  })

  it('keeps an active guide visible alongside a failed update alert', () => {
    useOfflinePacksMock.mockReturnValue({
      loading: false, error: 'Asset request failed', repair: vi.fn(), update: vi.fn(), remove: vi.fn(), discardFailed: vi.fn(), resume: vi.fn(async () => undefined),
      packs: [{ packId: 'crag-pack', kind: 'crag', entityId: CRAG_ID, displayName: 'Cobo Bay', manifestUrl: '/pack.json', activeVersion: 'v1', status: 'ready', installedAt: 'now', updatedAt: 'now', error: 'Asset request failed' }],
    })

    render(<OfflineLibraryView />)

    expect(screen.getByRole('alert')).toHaveTextContent('Asset request failed')
    expect(screen.getByRole('link', { name: 'Open saved crag' })).toBeVisible()
  })

  it('renders installed metadata, immutable topo media, route lines, and pins', async () => {
    listMock.mockResolvedValue([{ packId: 'crag-pack', kind: 'crag', entityId: CRAG_ID, displayName: 'Cobo Bay', manifestUrl: '/pack.json', activeVersion: 'v1', status: 'ready' }])
    getActiveMock.mockResolvedValue({
      pack: { packId: 'crag-pack', kind: 'crag', entityId: CRAG_ID, displayName: 'Cobo Bay', manifestUrl: '/pack.json', activeVersion: 'v1', status: 'ready', installedAt: '2026-07-29T10:00:00.000Z', updatedAt: '2026-07-29T10:00:00.000Z', error: null },
      version: {
        id: 'crag-pack:v1', packId: 'crag-pack', version: 'v1', state: 'active', createdAt: '2026-07-29T10:00:00.000Z',
        manifest: {
          packId: 'crag-pack', kind: 'crag', entityId: CRAG_ID, displayName: 'Cobo Bay', version: 'v1', manifestUrl: '/pack.json', estimatedBytes: 1000, assets: [], dependentManifestUrls: [],
          payload: {
            type: 'crag', schemaVersion: 1, minReaderVersion: 1, packId: 'crag-pack', cragId: CRAG_ID, cragName: 'Cobo Bay', cragVersionHash: 'v1', estimatedBytes: 1000, mediaUrls: ['https://media.example/topo.webp'], climbs: [], contentVersion: 'v1', generatedAt: '2026-07-29T10:00:00.000Z', canonicalPath: '/gg/cobo-bay',
            metadata: {
              crag: { id: CRAG_ID, name: 'Cobo Bay', slug: 'cobo-bay', countryCode: 'GG', country: 'Guernsey', regionName: null, subArea: null, rockType: 'granite', type: 'bouldering', tideDependency: null, description: 'Wave-washed granite.', accessNotes: null, coordinates: { latitude: 49.48, longitude: -2.62, visibility: 'exact' }, updatedAt: null },
              sectors: [],
              climbs: [{ id: 'climb-1', sectorId: null, name: 'Sunset Arete', slug: 'sunset-arete', grade: '6B', consensusGrade: null, originalGrade: null, routeType: 'boulder', description: 'Start low and follow the arete.', isVerified: true, verificationCount: 2, coordinates: { latitude: 49.48, longitude: -2.62, visibility: 'exact' }, updatedAt: null }],
              images: [{ id: 'image-1', captureDate: null, faceDirection: 'W', faceDirections: ['W'], faceOrder: 0, isPrimary: true, width: 1200, height: 800, coordinates: { latitude: 49.48, longitude: -2.62, visibility: 'exact' }, processedAt: null, assetVersion: 1 }],
              routeLines: [{ id: 'line-1', climbId: 'climb-1', imageId: 'image-1', sequenceOrder: 1, color: '#ef4444', imageWidth: 1200, imageHeight: 800, points: [{ x: 0.1, y: 0.7 }, { x: 0.5, y: 0.1 }] }],
            },
            assets: [{ id: 'image-1:topo:webp', imageId: 'image-1', variant: 'topo', format: 'webp', mediaType: 'image/webp', url: 'https://media.example/topo.webp', width: 1200, height: 800 }],
          },
        },
      },
    })

    render(<OfflineCragViewer />)

    expect(await screen.findByRole('heading', { name: 'Cobo Bay' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Sunset Arete' })).toBeInTheDocument()
    expect(screen.getByText('Start low and follow the arete.')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Cobo Bay topo' })).toHaveAttribute('src', 'https://media.example/topo.webp')
    expect(screen.getByRole('img', { name: 'Route lines on Cobo Bay topo' })).toBeInTheDocument()
    expect(document.querySelector('polyline')).toHaveAttribute('points', '120,560 600,80')
    expect(screen.getByText('49.48000, -2.62000')).toBeInTheDocument()
    expect(getActiveMock).toHaveBeenCalledWith('crag-pack')
  })

  it('opens legacy packs whose crag payload was wrapped with child manifests', async () => {
    listMock.mockResolvedValue([{ packId: 'crag-pack', kind: 'crag', entityId: CRAG_ID, activeVersion: 'v1', status: 'ready' }])
    getActiveMock.mockResolvedValue({
      pack: { packId: 'crag-pack', kind: 'crag', entityId: CRAG_ID, displayName: 'Legacy Crag', manifestUrl: '/pack.json', activeVersion: 'v1', status: 'ready', installedAt: 'now', updatedAt: 'now', error: null },
      version: {
        id: 'crag-pack:v1', packId: 'crag-pack', version: 'v1', state: 'active', createdAt: 'now',
        manifest: {
          packId: 'crag-pack', kind: 'crag', entityId: CRAG_ID, displayName: 'Legacy Crag', version: 'v1', manifestUrl: '/pack.json', estimatedBytes: 0, assets: [], dependentManifestUrls: ['/climb.json'],
          payload: { manifest: {
            type: 'crag', packId: 'crag-pack', cragId: CRAG_ID, cragName: 'Legacy Crag',
            metadata: { crag: { name: 'Legacy Crag', description: null }, climbs: [], images: [], routeLines: [] }, assets: [],
          }, children: [{ type: 'climb' }] },
        },
      },
    })

    render(<OfflineCragViewer />)

    expect(await screen.findByRole('heading', { name: 'Legacy Crag' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Saved crag not found' })).not.toBeInTheDocument()
  })

  it('offers update and removal for incompatible stored guide metadata', async () => {
    useOfflinePacksMock.mockReturnValue({ loading: false, packs: [], error: null, repair: vi.fn(), update: vi.fn(), remove: vi.fn(), resume: vi.fn(async () => undefined) })
    listMock.mockResolvedValue([{ packId: 'crag-pack', kind: 'crag', entityId: CRAG_ID, activeVersion: 'v1', status: 'ready' }])
    getActiveMock.mockResolvedValue({
      pack: { packId: 'crag-pack', kind: 'crag', entityId: CRAG_ID, displayName: 'Broken Crag', manifestUrl: '/pack.json', activeVersion: 'v1', status: 'ready', installedAt: 'now', updatedAt: 'now', error: null },
      version: { id: 'crag-pack:v1', packId: 'crag-pack', version: 'v1', state: 'active', createdAt: 'now', manifest: { payload: { type: 'crag' } } },
    })

    render(<OfflineCragViewer />)

    expect(await screen.findByRole('heading', { name: 'Saved guide needs attention' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Update guide' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Remove download' })).toBeEnabled()
  })
})
