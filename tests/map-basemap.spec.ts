import { test, expect } from '@playwright/test'

test.describe('Map basemap resources', () => {
  test('@full zoom requests new OpenFreeMap resources', async ({ page }) => {
    const openFreeMapRequests: string[] = []

    page.on('request', (request) => {
      const url = request.url()
      if (url.includes('tiles.openfreemap.org')) openFreeMapRequests.push(url)
    })

    await page.goto('/')
    await expect(page.locator('.maplibregl-map')).toBeVisible({ timeout: 20000 })
    await expect.poll(() => new Set(openFreeMapRequests).size, { timeout: 20000 }).toBeGreaterThan(0)

    const requestsBeforeZoom = new Set(openFreeMapRequests)
    const zoomIn = page.locator('.maplibregl-ctrl-zoom-in')
    await expect(zoomIn).toBeVisible()
    await zoomIn.click()
    await zoomIn.click()

    await expect.poll(
      () => openFreeMapRequests.some((url) => !requestsBeforeZoom.has(url)),
      { timeout: 15000 }
    ).toBe(true)
  })
})
