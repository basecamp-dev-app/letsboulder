import { expect, test, type BrowserContext, type CDPSession, type Page } from '@playwright/test'

import type { CragPackManifest } from '@/types/crag-pack-manifest'

const CRAG_ID = '11111111-1111-4111-8111-111111111111'
const FIXTURE_URL = '/offline/fixture'
const MANIFEST_PATH = `/api/offline-packs/crags/${CRAG_ID}/manifest`
const MEDIA_CACHE = 'letsboulder-offline-immutable-v1'

async function waitForOfflineReader(page: Page) {
  await page.waitForFunction(() => Boolean(navigator.serviceWorker?.controller))
}

function waitForServiceWorkerStatus(session: CDPSession, runningStatus: 'running' | 'stopped') {
  return new Promise<void>((resolve) => {
    const listener = (event: { versions: Array<{ runningStatus: string }> }) => {
      if (!event.versions.some((version) => version.runningStatus === runningStatus)) return
      session.off('ServiceWorker.workerVersionUpdated', listener)
      resolve()
    }
    session.on('ServiceWorker.workerVersionUpdated', listener)
  })
}

async function installPack(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(StorageManager.prototype, 'persisted', { configurable: true, value: async () => true })
    Object.defineProperty(StorageManager.prototype, 'persist', { configurable: true, value: async () => true })
    const nativeMatchMedia = window.matchMedia.bind(window)
    window.matchMedia = (query) => query === '(display-mode: standalone)'
      ? { ...nativeMatchMedia(query), matches: true }
      : nativeMatchMedia(query)
  })
  await page.goto(FIXTURE_URL)
  await waitForOfflineReader(page)
  await page.getByRole('button', { name: 'Download offline' }).click()
  await expect(page.getByRole('link', { name: 'Offline guide' })).toBeVisible()
}

async function readV2State(page: Page) {
  return page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('letsboulder-offline-packs')
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    const readAll = <T>(store: string) => new Promise<T[]>((resolve, reject) => {
      const request = database.transaction(store).objectStore(store).getAll()
      request.onsuccess = () => resolve(request.result as T[])
      request.onerror = () => reject(request.error)
    })
    const [packs, versions, assets, jobs] = await Promise.all([
      readAll<{ status: string; activeVersion: string | null }>('packs-v2'),
      readAll<{ state: string; openedAt: string | null }>('versions-v2'),
      readAll<{ state: string; byteCount: number; downloadedBytes: number; digest: string; verifiedDigest: string | null }>('assets-v2'),
      readAll<{ state: string }>('jobs-v2'),
    ])
    database.close()
    return { packs, versions, assets, jobs }
  })
}

async function seedLegacyPack(page: Page, source: CragPackManifest) {
  await page.goto('/manifest.json')
  await page.evaluate(async ({ manifestJson, manifestPath }) => {
    const manifest = JSON.parse(manifestJson) as {
      packId: string; cragId: string; cragName: string; exactTotalBytes: number
      assets: Array<{ imageId: string; variant: string; url: string; width: number; height: number; byteCount: number; mediaType: string }>
      [key: string]: unknown
    }
    const legacyVersion = 'pack-v1-legacy'
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('letsboulder-offline-packs', 1)
      request.onupgradeneeded = () => {
        const db = request.result
        const packs = db.createObjectStore('packs', { keyPath: 'packId' }); packs.createIndex('status', 'status')
        const versions = db.createObjectStore('versions', { keyPath: 'id' }); versions.createIndex('packId', 'packId')
        const assets = db.createObjectStore('assets', { keyPath: 'id' }); assets.createIndex('versionId', 'versionId'); assets.createIndex('url', 'url')
        const jobs = db.createObjectStore('jobs', { keyPath: 'id' }); jobs.createIndex('state', 'state')
      }
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error)
    })
    const versionId = `${manifest.packId}:${legacyVersion}`
    const transaction = database.transaction(['packs', 'versions', 'assets', 'jobs'], 'readwrite')
    transaction.objectStore('packs').put({ packId: manifest.packId, kind: 'crag', entityId: manifest.cragId, displayName: manifest.cragName, manifestUrl: manifestPath, activeVersion: legacyVersion, status: 'ready', installedAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z', error: null })
    const legacyPayload = { ...manifest, schemaVersion: 1, minReaderVersion: 1, assets: manifest.assets.map((asset) => ({ imageId: asset.imageId, variant: asset.variant, url: asset.url, width: asset.width, height: asset.height })) }
    transaction.objectStore('versions').put({ id: versionId, packId: manifest.packId, version: legacyVersion, manifest: { packId: manifest.packId, kind: 'crag', entityId: manifest.cragId, displayName: manifest.cragName, version: legacyVersion, manifestUrl: manifestPath, estimatedBytes: manifest.exactTotalBytes, assets: manifest.assets.map((asset) => ({ url: asset.url, estimatedBytes: asset.byteCount, mediaType: asset.mediaType })), dependentManifestUrls: [], payload: legacyPayload }, state: 'active', createdAt: '2026-09-01T00:00:00.000Z' })
    await new Promise<void>((resolve, reject) => { transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error) })
    database.close()
    const cache = await caches.open('letsboulder-offline-immutable-v1')
    for (const asset of manifest.assets) await cache.put(asset.url, await fetch(asset.url))
  }, { manifestJson: JSON.stringify(source), manifestPath: MANIFEST_PATH })
}

async function readMigrationState(page: Page) {
  return page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('letsboulder-offline-packs')
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error)
    })
    const transaction = database.transaction(['migrations-v2', 'packs'])
    const migrationRequest = transaction.objectStore('migrations-v2').getAll()
    const legacyRequest = transaction.objectStore('packs').getAll()
    const migrations = await new Promise<Array<{ state: string }>>((resolve, reject) => { migrationRequest.onsuccess = () => resolve(migrationRequest.result); migrationRequest.onerror = () => reject(migrationRequest.error) })
    const legacy = await new Promise<Array<{ activeVersion: string | null }>>((resolve, reject) => { legacyRequest.onsuccess = () => resolve(legacyRequest.result); legacyRequest.onerror = () => reject(legacyRequest.error) })
    database.close()
    return { migrations, legacy }
  })
}

async function clearFixtureState(context: BrowserContext) {
  await context.setOffline(false)
  await Promise.all(context.pages().map((page) => page.close()))
  const page = await context.newPage()
  await page.goto('/manifest.json')
  await page.evaluate(async () => {
    localStorage.clear()
    sessionStorage.clear()
    for (const name of await caches.keys()) await caches.delete(name)
    for (const registration of await navigator.serviceWorker.getRegistrations()) await registration.unregister()
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase('letsboulder-offline-packs')
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
      request.onblocked = () => resolve()
    })
  })
}

test.describe('mandatory offline reliability harness', () => {
  test.afterEach(async ({ context }) => {
    await clearFixtureState(context)
  })

  test('installs online and opens the complete saved guide across an offline page restart', async ({ page, context }) => {
    await installPack(page)
    await expect(page.getByText(/Verified on this device/i)).toBeVisible()
    const installed = await readV2State(page)
    expect(installed.packs[0]?.status).toBe('verified')
    expect(installed.assets).toHaveLength(2)
    expect(installed.assets.every((asset) => asset.state === 'verified'
      && asset.downloadedBytes === asset.byteCount && asset.verifiedDigest === asset.digest)).toBe(true)
    await page.goto('/offline/library')
    await expect(page.getByRole('heading', { name: 'Offline library' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Open saved crag' })).toBeVisible()

    await context.setOffline(true)
    const startedAt = Date.now()
    await page.reload({ waitUntil: 'domcontentloaded' })
    expect(Date.now() - startedAt).toBeLessThan(2_000)
    await page.getByRole('link', { name: 'Open saved crag' }).click()
    await expect(page.getByRole('heading', { name: 'Signal Lost Cove' })).toBeVisible()

    await page.close()
    const reopened = await context.newPage()
    await reopened.goto('/offline/library', { waitUntil: 'domcontentloaded' })
    await reopened.getByRole('link', { name: 'Open saved crag' }).click()
    await expect(reopened.getByText('Approach from the harbour steps')).toBeVisible()
    await expect(reopened.getByText('Low tide only')).toBeVisible()
    await expect(reopened.getByText('Crag: 49.45012, -2.53987')).toBeVisible()
    await expect(reopened.getByText('Harbour Wall · Boulder')).toBeVisible()
    await expect(reopened.getByText('West Headland · Boulder')).toBeVisible()
    await expect(reopened.getByText(/saved as text only/i)).toBeVisible()
    await expect(reopened.locator('figure img')).toHaveCount(2)
    await expect.poll(() => reopened.locator('figure img').evaluateAll((images) => images.every((image) => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0))).toBe(true)
    const curvedRoute = reopened.locator('[data-route-line-id="55555555-5555-4555-8555-555555555551"]')
    await expect(curvedRoute.locator('path')).toHaveCount(2)
    await expect(curvedRoute.locator('path').first()).toHaveAttribute('d', 'M 0.2 0.9 Q 0.4 0.2 0.5 0.4 Q 0.6 0.6 0.7 0.4 L 0.8 0.2')
    await expect(curvedRoute.locator('path').nth(1)).toHaveAttribute('stroke', '#10b981')
    await expect(curvedRoute.locator('circle')).toHaveAttribute('cx', '0.2')
    await expect(curvedRoute.locator('circle')).toHaveAttribute('cy', '0.9')
    await expect(reopened.locator('polyline')).toHaveCount(0)
  })

  for (const [name, corrupt] of [
    ['digest mismatch', (manifest: CragPackManifest) => ({ ...manifest.assets[0], digest: `sha256:${'0'.repeat(64)}` })],
    ['byte-count mismatch', (manifest: CragPackManifest) => ({ ...manifest.assets[0], byteCount: manifest.assets[0].byteCount + 1 })],
  ] as const) {
    test(`${name} prevents first activation`, async ({ page }) => {
      const manifest = await page.request.get(MANIFEST_PATH).then((response) => response.json()) as CragPackManifest
      const asset = corrupt(manifest)
      await page.route(`**${MANIFEST_PATH}`, (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({
        ...manifest, assets: [asset, ...manifest.assets.slice(1)],
        exactTotalBytes: asset.byteCount + manifest.assets.slice(1).reduce((total, item) => total + item.byteCount, 0),
      }) }))
      await page.goto(FIXTURE_URL)
      await waitForOfflineReader(page)
      await page.getByRole('button', { name: 'Download offline' }).click()
      await expect(page.getByText(/digest does not match|byte count does not match/i)).toBeVisible()
      expect((await readV2State(page)).packs[0]?.activeVersion).toBeNull()
    })
  }

  test('missing IndexedDB asset metadata changes Verified to Needs repair', async ({ page }) => {
    await installPack(page)
    await page.evaluate(async () => {
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('letsboulder-offline-packs')
        request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error)
      })
      const transaction = database.transaction('assets-v2', 'readwrite')
      const store = transaction.objectStore('assets-v2')
      const all = await new Promise<Array<{ id: string }>>((resolve, reject) => {
        const request = store.getAll(); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error)
      })
      if (all[0]) store.delete(all[0].id)
      await new Promise<void>((resolve, reject) => { transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error) })
      database.close()
    })
    await page.goto('/offline/library')
    await expect.poll(async () => (await readV2State(page)).packs[0]?.status).toBe('needs-repair')
  })

  test('quota exhaustion prevents first activation', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(StorageManager.prototype, 'estimate', { configurable: true, value: async () => ({ quota: 1, usage: 0 }) })
    })
    await page.goto(FIXTURE_URL)
    await waitForOfflineReader(page)
    await page.getByRole('button', { name: 'Download offline' }).click()
    await expect(page.getByText(/Storage quota is too small/i)).toBeVisible()
    await expect(page.getByRole('link', { name: 'Offline guide' })).toHaveCount(0)
  })

  test('an incompatible update preserves the active verified version', async ({ page }) => {
    await installPack(page)
    const manifest = await page.request.get(MANIFEST_PATH).then((response) => response.json()) as CragPackManifest
    await page.route(`**${MANIFEST_PATH}`, (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ...manifest, minReaderVersion: 3, contentVersion: 'future', cragVersionHash: 'future' }) }))
    page.once('dialog', (dialog) => void dialog.accept())
    await page.goto('/offline/library')
    await page.getByRole('button', { name: 'Update' }).click()
    await expect(page.getByRole('region', { name: 'Saved guides' }).getByRole('alert')).toContainText(/newer reader/i)
    expect((await readV2State(page)).packs[0]?.activeVersion).toBe(manifest.contentVersion)
  })

  test('interrupted Pack v1 migration keeps the legacy guide usable and resumes in a new page', async ({ page, context }) => {
    const manifest = await page.request.get(MANIFEST_PATH).then((response) => response.json()) as CragPackManifest
    await seedLegacyPack(page, manifest)
    await page.evaluate(() => {
      localStorage.setItem('sb-offline-fixture-auth-token', JSON.stringify({ access_token: 'fixture' }))
      localStorage.removeItem('sb-offline-fixture-auth-token')
      window.dispatchEvent(new StorageEvent('storage', { key: 'sb-offline-fixture-auth-token', newValue: null }))
    })
    await page.route(`**${MANIFEST_PATH}`, (route) => route.abort('internetdisconnected'))
    await page.goto('/offline/library')
    await expect(page.getByRole('link', { name: 'Open saved crag' })).toBeVisible()
    expect((await readMigrationState(page)).migrations[0]?.state).toBe('failed')

    await page.unroute(`**${MANIFEST_PATH}`)
    await page.close()
    const resumed = await context.newPage()
    await resumed.goto('/offline/library')
    await expect.poll(async () => (await readMigrationState(resumed)).migrations[0]?.state).toBe('activated')
    const beforeOpen = await readMigrationState(resumed)
    expect(beforeOpen.legacy[0]?.activeVersion).toBe('pack-v1-legacy')
    await resumed.getByRole('link', { name: 'Open saved crag' }).click()
    await expect(resumed.getByRole('heading', { name: 'Signal Lost Cove' })).toBeVisible()
    await expect.poll(async () => (await readMigrationState(resumed)).migrations[0]?.state).toBe('opened')
    expect((await readMigrationState(resumed)).legacy[0]?.activeVersion).toBe('pack-v1-legacy')
  })

  test('does not activate an interrupted first install and resumes it', async ({ page }) => {
    await page.goto(FIXTURE_URL)
    await waitForOfflineReader(page)
    let interrupted = false
    await page.route(/\/images\/.*\/v1\/topo\.webp$/, async (route) => {
      if (!interrupted) {
        interrupted = true
        await route.abort('internetdisconnected')
        return
      }
      await route.continue()
    })

    await page.getByRole('button', { name: 'Download offline' }).click()
    await expect(page.getByText(/failed to fetch|fetch failed/i)).toBeVisible()
    await expect(page.getByRole('link', { name: 'Offline guide' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Retry download' })).toBeVisible()

    await page.unroute(/\/images\/.*\/v1\/topo\.webp$/)
    await page.getByRole('button', { name: 'Retry download' }).click()
    await expect(page.getByRole('link', { name: 'Offline guide' })).toBeVisible()
  })

  test('detects evicted media and keeps the degraded guide readable', async ({ page, context }) => {
    await installPack(page)
    await page.evaluate(async (cacheName) => {
      const cache = await caches.open(cacheName)
      const [first] = await cache.keys()
      if (first) await cache.delete(first)
    }, MEDIA_CACHE)

    await context.setOffline(true)
    await page.goto('/offline/library')
    await expect(page.getByText('Needs repair')).toBeVisible()
    await page.getByRole('link', { name: 'Open saved crag' }).click()
    await expect(page.getByRole('heading', { name: 'Signal Lost Cove' })).toBeVisible()
    await expect(page.locator('main').getByRole('alert')).toContainText('Some saved media is missing')
    await expect(page.locator('figure img')).toHaveCount(1)
  })

  test('preserves the active guide after a failed update', async ({ page }) => {
    await installPack(page)
    const manifest = await page.request.get(MANIFEST_PATH).then((response) => response.json()) as CragPackManifest
    const failedAsset = {
      ...manifest.assets[0],
      id: 'failed-update-asset',
      url: '/images/99999999-9999-4999-8999-999999999999/v1/topo.webp',
    }
    await page.route(`**${MANIFEST_PATH}`, async (route) => {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          ...manifest,
          cragVersionHash: 'phase-one-fixture-v2-failed',
          contentVersion: 'phase-one-fixture-v2-failed',
          assets: [...manifest.assets, failedAsset],
          mediaUrls: [...manifest.mediaUrls, failedAsset.url],
          exactTotalBytes: manifest.exactTotalBytes + failedAsset.byteCount,
          estimatedBytes: manifest.exactTotalBytes + failedAsset.byteCount,
        }),
      })
    })
    page.once('dialog', (dialog) => void dialog.accept())

    await page.goto('/offline/library')
    await page.getByRole('button', { name: 'Update' }).click()
    await expect(page.getByRole('region', { name: 'Saved guides' }).getByRole('alert')).toContainText(/asset request failed/i)
    await expect(page.getByRole('link', { name: 'Open saved crag' })).toBeVisible()
    await page.getByRole('link', { name: 'Open saved crag' }).click()
    await expect(page.getByRole('heading', { name: 'Signal Lost Cove' })).toBeVisible()
    await expect(page.locator('figure img')).toHaveCount(2)
  })

  test('keeps public packs through an authentication-state change', async ({ page }) => {
    await installPack(page)
    await page.evaluate(() => {
      localStorage.setItem('sb-offline-fixture-auth-token', JSON.stringify({ access_token: 'fixture' }))
      localStorage.removeItem('sb-offline-fixture-auth-token')
      window.dispatchEvent(new StorageEvent('storage', { key: 'sb-offline-fixture-auth-token', newValue: null }))
    })

    await page.goto('/offline/library')
    await expect(page.getByRole('link', { name: 'Open saved crag' })).toBeVisible()
  })

  test('navigates offline after the service worker process restarts', async ({ page, context }) => {
    await installPack(page)
    await page.goto('/offline/library')
    await expect(page.getByRole('link', { name: 'Open saved crag' })).toBeVisible()
    const session = await context.newCDPSession(page)
    await session.send('ServiceWorker.enable')
    const stopped = waitForServiceWorkerStatus(session, 'stopped')
    await session.send('ServiceWorker.stopAllWorkers')
    await stopped
    const restarted = waitForServiceWorkerStatus(session, 'running')
    await page.evaluate(async () => {
      const response = await fetch('/offline/library')
      if (!response.ok) throw new Error(`Unable to restart service worker: ${response.status}`)
    })
    await restarted
    await context.setOffline(true)

    await page.goto(`/offline/crag?id=${CRAG_ID}`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: 'Signal Lost Cove' })).toBeVisible()
    await expect(page.locator('figure img')).toHaveCount(2)
  })
})
