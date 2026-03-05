import { test, expect } from '@playwright/test'

test.describe('Auth', () => {
  test('@smoke auth page loads and displays login form', async ({ page }) => {
    await page.goto('/auth')
    
    await expect(page.getByText('Welcome to letsboulder')).toBeVisible()
    await expect(page.getByRole('button', { name: /continue with google/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /continue with discord/i })).toBeVisible()
    await expect(page.getByText('Sign in with email instead')).toBeVisible()
  })

  test('@full magic link form validates email format before submission', async ({ page }) => {
    await page.goto('/auth')

    await page.getByText('Sign in with email instead').click()

    const emailInput = page.getByPlaceholder('you@example.com')
    await expect(emailInput).toBeVisible({ timeout: 10000 })
    await emailInput.fill('invalid-email')

    const submitButton = page.getByRole('button', { name: /email me a magic link/i })
    await expect(submitButton).not.toBeVisible()
  })

  test('@smoke unauthenticated access to /submit redirects to /auth', async ({ page }) => {
    await page.goto('/submit')
    
    await expect(page).toHaveURL(/\/auth/)
  })
})
