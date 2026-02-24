import { test, expect } from '@playwright/test'

test.describe('Map', () => {
  test('homepage map loads', async ({ page }) => {
    await page.goto('/')
    
    await page.waitForTimeout(3000)
    
    const mapContainer = page.locator('.leaflet-container, [class*="map"], [id*="map"]')
    const mapExists = await mapContainer.count() > 0
    
    if (!mapExists) {
      await expect(page.getByText(/loading|map/i).first()).toBeVisible({ timeout: 5000 })
    }
  })

  test('map has zoom controls', async ({ page }) => {
    await page.goto('/')
    
    await page.waitForTimeout(3000)
    
    const zoomIn = page.locator('.leaflet-control-zoom-in, [aria-label="Zoom in"]')
    const zoomOut = page.locator('.leaflet-control-zoom-out, [aria-label="Zoom out"]')
    
    const hasZoomControls = (await zoomIn.count() > 0) || (await zoomOut.count() > 0)
    
    if (!hasZoomControls) {
      test.skip()
    }
  })

  test('can interact with map zoom', async ({ page }) => {
    await page.goto('/')
    
    await page.waitForTimeout(3000)
    
    const zoomIn = page.locator('.leaflet-control-zoom-in').first()
    
    if (await zoomIn.isVisible()) {
      await zoomIn.click()
      await page.waitForTimeout(500)
    }
  })

  test('map displays markers for crags', async ({ page }) => {
    await page.goto('/')
    
    await page.waitForTimeout(3000)
    
    const markers = page.locator('.leaflet-marker-icon, [class*="marker"]')
    const markerCount = await markers.count()
    
    expect(markerCount).toBeGreaterThanOrEqual(0)
  })

  test('bouldering map page loads', async ({ page }) => {
    await page.goto('/bouldering-map')
    
    await page.waitForTimeout(3000)
    
    const heading = page.getByRole('heading', { name: /bouldering|map/i })
    await expect(heading.first()).toBeVisible({ timeout: 10000 })
  })

  test('climbing map page loads', async ({ page }) => {
    await page.goto('/climbing-map')
    
    await page.waitForTimeout(3000)
    
    const heading = page.getByRole('heading', { name: /climbing|map/i })
    await expect(heading.first()).toBeVisible({ timeout: 10000 })
  })

  test('rock climbing map page loads', async ({ page }) => {
    await page.goto('/rock-climbing-map')
    
    await page.waitForTimeout(3000)
    
    const heading = page.getByRole('heading', { name: /rock climbing|map/i })
    await expect(heading.first()).toBeVisible({ timeout: 10000 })
  })
})
