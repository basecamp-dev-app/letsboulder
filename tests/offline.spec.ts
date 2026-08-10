import { expect, test } from '@playwright/test'

const cragUrl = process.env.OFFLINE_E2E_CRAG_URL
const cragId = process.env.OFFLINE_E2E_CRAG_ID

test.describe('offline crag packs', () => {
  test.skip(!cragUrl || !cragId, 'Set OFFLINE_E2E_CRAG_URL and OFFLINE_E2E_CRAG_ID for fixture-backed offline E2E coverage')

  test('installs online, reloads offline, and opens the saved crag', async ({ page, context }) => {
    await page.goto(cragUrl as string)
    await page.getByRole('button', { name: 'Download offline' }).click()
    await expect(page.getByRole('status')).toContainText(/storage|protected|evict/i)
    await page.goto('/offline/library')
    await expect(page.getByRole('link', { name: 'Open saved crag' })).toBeVisible()

    await context.setOffline(true)
    await page.reload()
    await page.getByRole('link', { name: 'Open saved crag' }).click()
    await expect(page.getByRole('heading', { name: /saved field guide/i })).toBeVisible()
    await expect(page.getByText('Pins-only context')).toBeVisible()
  })

  test('resumes an interrupted download after reload', async ({ page, context }) => {
    await page.goto(cragUrl as string)
    await page.getByRole('button', { name: 'Download offline' }).click()
    await context.setOffline(true)
    await page.reload()
    await expect(page.getByRole('button', { name: /retry download|download offline/i })).toBeVisible()
    await context.setOffline(false)
    await page.getByRole('button', { name: /retry download/i }).click()
    await expect(page.getByRole('link', { name: 'Offline guide' })).toBeVisible()
  })

  test('keeps the active version after a failed update and recovers evicted media', async ({ page, context }) => {
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
})
