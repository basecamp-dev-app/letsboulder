import { test, expect } from '@playwright/test'

test.describe('Map', () => {
  test('@smoke homepage map renders', async ({ page }) => {
    await page.goto('/')

    await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 20000 })
    await expect(page.getByRole('button', { name: 'Save view' })).toBeVisible({ timeout: 20000 })
    await expect(page.locator('.leaflet-tile').first()).toBeVisible({ timeout: 20000 })
  })

  test('@full map tiles load', async ({ page }) => {
    await page.goto('/')

    await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 20000 })
    await expect(page.locator('.leaflet-tile').first()).toBeVisible({ timeout: 20000 })
  })

  test('@smoke bouldering map page loads', async ({ page }) => {
    await page.goto('/bouldering-map')

    await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 20000 })
    await expect(
      page.getByRole('heading', { name: /Bouldering map for Skye, Guernsey, and beyond/i })
    ).toBeVisible({ timeout: 20000 })
  })

  test('@smoke climbing map page loads', async ({ page }) => {
    await page.goto('/climbing-map')

    await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 20000 })
    await expect(
      page.getByRole('heading', { name: /Interactive climbing map for Skye, Scotland, and Guernsey/i })
    ).toBeVisible({ timeout: 20000 })
  })

  test('@smoke rock climbing map page loads', async ({ page }) => {
    await page.goto('/rock-climbing-map')

    await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 20000 })
    await expect(
      page.getByRole('heading', { name: /Rock climbing map for Skye and Guernsey crags/i })
    ).toBeVisible({ timeout: 20000 })
  })
})
