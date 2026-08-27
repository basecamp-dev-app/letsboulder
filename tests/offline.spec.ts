import { expect, test, type Page } from '@playwright/test'

const cragUrl = process.env.OFFLINE_E2E_CRAG_URL
const cragId = process.env.OFFLINE_E2E_CRAG_ID

test.describe('offline crag packs', () => {
  test.skip(!cragUrl || !cragId, 'Set OFFLINE_E2E_CRAG_URL and OFFLINE_E2E_CRAG_ID for fixture-backed offline E2E coverage')

  async function installPack(page: Page) {
    await page.goto(cragUrl as string)
    await page.getByRole('button', { name: 'Download offline' }).click()
    await expect(page.getByRole('status')).toContainText(/download complete/i)
  }

  test('installs online, reloads offline, and opens the saved crag', async ({ page, context }) => {
    await installPack(page)
    await page.goto('/offline')
    await expect(page.getByRole('heading', { name: 'Offline library' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Open saved crag' })).toBeVisible()

    await context.setOffline(true)
    await page.reload()
    await page.getByRole('link', { name: 'Open saved crag' }).click()
    await expect(page.getByRole('heading', { name: /saved field guide/i })).toBeVisible()
    await expect(page.getByText('Pins-only context')).toBeVisible()

    await context.setOffline(false)
    await page.reload()
    await expect(page.getByRole('link', { name: 'Return to online app' })).toBeVisible()
  })

  test('resumes an interrupted download after reload', async ({ page }) => {
    await page.goto(cragUrl as string)
    let interrupted = false
    await page.route(/\/images\/.*\.webp(?:\?.*)?$/, async (route) => {
      if (!interrupted) {
        interrupted = true
        await route.abort('internetdisconnected')
      } else {
        await route.continue()
      }
    })
    await page.getByRole('button', { name: 'Download offline' }).click()
    await expect(page.getByText(/failed|interrupted|fetch/i)).toBeVisible()
    await page.reload()
    await expect(page.getByRole('button', { name: /retry download|download offline/i })).toBeVisible()
    await page.unroute(/\/images\/.*\.webp(?:\?.*)?$/)
    await page.getByRole('button', { name: /retry download/i }).click()
    await expect(page.getByRole('status')).toContainText(/download complete/i)
    await expect(page.getByRole('link', { name: 'Offline guide' })).toBeVisible()
  })

  test('keeps the active version after a failed update and recovers evicted media', async ({ page, context }) => {
    await installPack(page)
    await page.goto('/offline/library')
    await expect(page.getByRole('link', { name: 'Open saved crag' })).toBeVisible()
    await page.evaluate(async () => {
      const cache = await caches.open('letsboulder-offline-immutable-v1')
      for (const request of await cache.keys()) await cache.delete(request)
    })
    await context.setOffline(true)
    await page.reload()
    await expect(page.getByText('Needs repair')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Open saved crag' })).toBeVisible()
  })

  test('explains a missing pack and provides navigation recovery', async ({ page }) => {
    await page.goto('/offline/crag?id=123e4567-e89b-42d3-a456-426614174000')
    await expect(page.getByRole('heading', { name: 'Saved crag not found' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Back to offline library' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Return to online app' })).toBeVisible()
  })
})
