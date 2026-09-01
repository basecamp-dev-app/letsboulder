import { expect, test, type BrowserContext, type Page } from '@playwright/test'

import type { CragPackManifest } from '@/types/crag-pack-manifest'

const CRAG_ID = '11111111-1111-4111-8111-111111111111'
const FIXTURE_URL = '/offline/fixture'
const MANIFEST_PATH = `/api/offline-packs/crags/${CRAG_ID}/manifest`
const MEDIA_CACHE = 'letsboulder-offline-immutable-v1'

async function waitForOfflineReader(page: Page) {
  await page.waitForFunction(() => Boolean(navigator.serviceWorker?.controller))
}

async function installPack(page: Page) {
  await page.goto(FIXTURE_URL)
  await waitForOfflineReader(page)
  await page.getByRole('button', { name: 'Download offline' }).click()
  await expect(page.getByRole('link', { name: 'Offline guide' })).toBeVisible()
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
    await expect(page.getByRole('alert')).toContainText('Some saved media is missing')
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
          estimatedBytes: manifest.estimatedBytes + (failedAsset.estimatedBytes ?? 0),
        }),
      })
    })
    page.once('dialog', (dialog) => void dialog.accept())

    await page.goto('/offline/library')
    await page.getByRole('button', { name: 'Update' }).click()
    await expect(page.getByText(/asset request failed/i)).toBeVisible()
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
    const session = await context.newCDPSession(page)
    await session.send('ServiceWorker.enable')
    await session.send('ServiceWorker.stopAllWorkers')
    await context.setOffline(true)

    await page.goto(`/offline/crag?id=${CRAG_ID}`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: 'Signal Lost Cove' })).toBeVisible()
    await expect(page.locator('figure img')).toHaveCount(2)
  })
})
