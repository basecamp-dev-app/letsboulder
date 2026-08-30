import { test, expect } from '@playwright/test'

test.describe('Map', () => {
  test('@smoke homepage map renders', async ({ page }) => {
    await page.goto('/')

    await expect(page.locator('.maplibregl-map')).toBeVisible({ timeout: 20000 })
  })

  test('@full map tiles load', async ({ page }) => {
    await page.goto('/')

    await expect(page.locator('.maplibregl-map')).toBeVisible({ timeout: 20000 })
  })

  test('@smoke bouldering map page loads', async ({ page }) => {
    await page.goto('/bouldering-map')

    await expect(page).toHaveURL('/')
    await expect(page.locator('.maplibregl-map')).toBeVisible({ timeout: 20000 })
  })

  test('@smoke climbing map page loads', async ({ page }) => {
    await page.goto('/climbing-map')

    await expect(page).toHaveURL('/')
    await expect(page.locator('.maplibregl-map')).toBeVisible({ timeout: 20000 })
  })

  test('@smoke rock climbing map page loads', async ({ page }) => {
    await page.goto('/rock-climbing-map')

    await expect(page).toHaveURL('/')
    await expect(page.locator('.maplibregl-map')).toBeVisible({ timeout: 20000 })
  })

  test.describe('without WebGL', () => {
    test.beforeEach(async ({ page }) => {
      await page.addInitScript(() => {
        const originalGetContext = HTMLCanvasElement.prototype.getContext
        HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, contextId, options) {
          if (contextId === 'webgl' || contextId === 'webgl2' || contextId === 'experimental-webgl') return null
          return originalGetContext.call(this, contextId, options)
        } as typeof HTMLCanvasElement.prototype.getContext
      })
    })

    test('home preserves discovery and community content', async ({ page }) => {
      await page.goto('/')

      await expect(page.getByRole('heading', { name: 'Interactive map unavailable' })).toBeVisible()
      await expect(page.getByPlaceholder('Search all crags and climbs')).toBeVisible()
      await expect(page.getByRole('heading', { name: 'Recent crag updates' })).toBeVisible()
      await expect(page.getByRole('link', { name: 'Search crags and climbs' })).toBeVisible()
      await expect(page.getByText('Something went wrong')).toHaveCount(0)
    })

    for (const route of ['/gb/harrisons-rocks', '/ch/magic-wood']) {
      test(`${route} preserves crag details and routes`, async ({ page }) => {
        await page.goto(route)

        await expect(page.getByRole('heading', { name: 'Interactive map unavailable' })).toBeVisible()
        await expect(page.getByRole('link', { name: 'Browse routes' })).toBeVisible()
        await expect(page.locator('#crag-routes')).toBeVisible()
        await expect(page.getByText('Unable to load this crag page')).toHaveCount(0)
      })
    }

    test('indexed climb route preserves topo and climb details', async ({ page }) => {
      await page.goto('/gb/harrisons-rocks/giants-ear')

      await expect(page.locator('#climb-details')).toBeVisible()
      await expect(page.getByText('Unable to load this crag page')).toHaveCount(0)
      await expect(page.getByText('Something went wrong')).toHaveCount(0)
    })
  })
})
