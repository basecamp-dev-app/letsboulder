import { test, expect } from '@playwright/test'

test.describe('Map', () => {
  test('@smoke homepage map renders', async ({ page }) => {
    await page.goto('/')

    await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 20000 })
    await expect(page.locator('.leaflet-tile').first()).toBeVisible({ timeout: 20000 })
  })

  test('@full map tiles load', async ({ page }) => {
    await page.goto('/')

    await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 20000 })
    await expect(page.locator('.leaflet-tile').first()).toBeVisible({ timeout: 20000 })
  })

  test('@smoke bouldering map page loads', async ({ page }) => {
    await page.goto('/bouldering-map')

    await expect(page).toHaveURL('/')
    await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 20000 })
  })

  test('@smoke climbing map page loads', async ({ page }) => {
    await page.goto('/climbing-map')

    await expect(page).toHaveURL('/')
    await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 20000 })
  })

  test('@smoke rock climbing map page loads', async ({ page }) => {
    await page.goto('/rock-climbing-map')

    await expect(page).toHaveURL('/')
    await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 20000 })
  })
})
