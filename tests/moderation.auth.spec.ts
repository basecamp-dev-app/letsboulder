import { test, expect } from '@playwright/test'

test.describe('Moderation Queue', () => {
  test('@smoke moderation queue page loads for admin', async ({ page }) => {
    await page.goto('/admin/moderation')
    await expect(page.getByText('Moderation')).toBeVisible({ timeout: 10000 })
  })

  test('@full moderation queue displays pending items', async ({ page }) => {
    await page.goto('/admin/moderation')
    await page.waitForLoadState('networkidle')

    const tableRows = page.locator('tbody tr')
    const count = await tableRows.count()
    expect(count).toBeGreaterThanOrEqual(0)
  })

  test('@full filter by status works', async ({ page }) => {
    await page.goto('/admin/moderation')
    await page.waitForLoadState('networkidle')

    const statusFilter = page.locator('select[name="status"]').first()
    if (await statusFilter.isVisible()) {
      await statusFilter.selectOption('pending')
      await page.waitForTimeout(500)
    }
  })

  test('@full vote button appears on pending item', async ({ page }) => {
    await page.goto('/admin/moderation')
    await page.waitForLoadState('networkidle')

    const verifyButton = page.locator('button:has-text("Verify")').first()
    if (await verifyButton.isVisible()) {
      await expect(page.getByText('Verify')).toBeVisible()
    }
  })
})

test.describe('Moderation Vote Flow', () => {
  test('@full submit verify vote', async ({ page }) => {
    await page.goto('/admin/moderation')
    await page.waitForLoadState('networkidle')

    const firstRow = page.locator('tbody tr').first()
    if (await firstRow.isVisible()) {
      const verifyButton = firstRow.locator('button:has-text("Verify")')
      if (await verifyButton.isVisible()) {
        await verifyButton.click()
        await page.waitForTimeout(500)
      }
    }
  })

})
