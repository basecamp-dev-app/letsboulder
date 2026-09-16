import { test, expect } from '@playwright/test'
import sharp from 'sharp'

test.describe('Map basemap resources', () => {
  test('@smoke @full renders successful basemap tiles and refines them on zoom', async ({ page }) => {
    test.setTimeout(60_000)
    const successfulTiles = new Map<string, number>()
    page.on('response', (response) => {
      const url = new URL(response.url())
      const tile = url.pathname.match(/\/(\d+)\/\d+\/\d+(?:\.(?:pbf|mvt|png|webp))?$/)
      if (url.hostname === 'tiles.openfreemap.org' && tile && response.status() === 200) {
        successfulTiles.set(url.href, Number(tile[1]))
      }
    })

    await page.goto('/')
    const map = page.getByTestId('maplibre-vector-map')
    const canvas = map.locator('canvas.maplibregl-canvas')
    await expect(canvas).toBeVisible({ timeout: 20_000 })
    await expect.poll(() => successfulTiles.size, { timeout: 20_000 }).toBeGreaterThan(0)

    // A visible canvas element alone can still contain only a blank background.
    // Inspect the actual rendered pixels, without browser-specific snapshots.
    await expect.poll(async () => {
      const { channels } = await sharp(await canvas.screenshot()).stats()
      return Math.max(...channels.slice(0, 3).map((channel) => channel.stdev))
    }, { timeout: 15_000 }).toBeGreaterThan(5)

    const initialTileZoom = Math.max(...successfulTiles.values())
    const zoomIn = map.locator('.maplibregl-ctrl-zoom-in')
    await expect(zoomIn).toBeVisible()
    await zoomIn.click()
    await zoomIn.click()
    await expect.poll(
      () => [...successfulTiles.values()].some((zoom) => zoom > initialTileZoom),
      { timeout: 15_000 }
    ).toBe(true)
    await expect(canvas).toBeVisible()
  })
})
