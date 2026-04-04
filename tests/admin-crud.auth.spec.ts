import { test, expect } from '@playwright/test'

test.describe('Admin Panel - Crag CRUD', () => {
  test('@smoke admin crags page loads', async ({ page }) => {
    await page.goto('/admin/crags')
    await expect(page.getByText('Crags')).toBeVisible({ timeout: 10000 })
  })

  test('@full load admin crags with data', async ({ page }) => {
    await page.goto('/admin/crags')
    await page.waitForLoadState('networkidle')
    const rows = page.locator('tbody tr')
    await expect(rows.first()).toBeVisible({ timeout: 10000 })
  })

  test('@full rename crag modal opens', async ({ page }) => {
    await page.goto('/admin/crags')
    await page.waitForLoadState('networkidle')

    const editButton = page.locator('button:has-text("Edit")').first()
    if (await editButton.isVisible()) {
      await editButton.click()
      await expect(page.getByLabel('Name')).toBeVisible()
    }
  })

  test('@full delete crag modal opens', async ({ page }) => {
    await page.goto('/admin/crags')
    await page.waitForLoadState('networkidle')

    const deleteButton = page.locator('button:has-text("Delete")').first()
    if (await deleteButton.isVisible()) {
      await deleteButton.click()
      await expect(page.getByText('Type the climb count')).toBeVisible()
    }
  })
})

test.describe('Admin Panel - Gyms', () => {
  test('@smoke admin gyms page loads', async ({ page }) => {
    await page.goto('/admin/gyms')
    await expect(page.getByText('Gyms')).toBeVisible({ timeout: 10000 })
  })

  test('@full create gym modal opens', async ({ page }) => {
    await page.goto('/admin/gyms')
    await page.waitForLoadState('networkidle')

    const createButton = page.getByRole('button', { name: /add|create|new/i }).first()
    if (await createButton.isVisible()) {
      await createButton.click()
      await expect(page.getByLabel('Name')).toBeVisible()
    }
  })
})
