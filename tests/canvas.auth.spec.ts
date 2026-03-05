import { test, expect } from '@playwright/test'

test.describe('Canvas (Route Drawing)', () => {
  test('@full submit page loads without errors', async ({ page }) => {
    await page.goto('/submit')
    
    await expect(page.getByText('Upload Route Photo')).toBeVisible({ timeout: 10000 })
  })

  test('@full submit page has heading', async ({ page }) => {
    await page.goto('/submit')
    
    await expect(page.getByRole('heading')).toBeVisible()
  })
})
