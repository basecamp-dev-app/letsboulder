import { test, expect } from '@playwright/test'

test.describe('Auth', () => {
  test('@smoke auth page loads and displays login form', async ({ page }) => {
    await page.goto('/auth')

    await expect(page.getByText('Welcome to letsboulder')).toBeVisible()
    await expect(page.getByRole('button', { name: /continue with google/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /continue with discord/i })).toBeVisible()
    await expect(page.getByText(/terms of service/i)).toBeVisible()
  })

  test('@full auth page exposes at least one primary sign-in method', async ({ page }) => {
    await page.goto('/auth')

    await expect(
      page.getByRole('button', { name: /continue with google/i })
        .or(page.getByRole('button', { name: /continue with discord/i }))
        .first()
    ).toBeVisible()
  })

  test('@smoke unauthenticated access to /submit redirects to /auth', async ({ page }) => {
    await page.goto('/submit')
    
    await expect(page).toHaveURL(/\/auth/)
  })
})
