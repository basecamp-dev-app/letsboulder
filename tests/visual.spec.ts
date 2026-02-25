import { test, expect } from '@playwright/test'

test.describe('Visual - Key Element Checks', () => {
  test('auth page has all key elements', async ({ page }) => {
    await page.goto('/auth')
    
    await expect(page.getByText('Welcome to letsboulder')).toBeVisible()
    await expect(page.getByRole('button', { name: /continue with google/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /continue with discord/i })).toBeVisible()
    await expect(page.getByText('Sign in with email instead')).toBeVisible()
    await expect(page.getByText('Terms of Service')).toBeVisible()
  })

  test('community page has all key elements', async ({ page }) => {
    await page.goto('/community')
    
    await expect(page.getByRole('heading', { name: 'Community' })).toBeVisible()
    await expect(page.getByText('Pick a place to see upcoming sessions')).toBeVisible()
    await expect(page.getByRole('link', { name: /open global rankings/i })).toBeVisible()
  })

  test('logbook page has all key elements for unauthenticated user', async ({ page }) => {
    await page.goto('/logbook')
    
    await expect(page.getByRole('heading', { name: 'My Climbing Logbook' })).toBeVisible()
    await expect(page.getByText('Please login to view your logbook')).toBeVisible()
  })

  test('home page loads without critical errors', async ({ page }) => {
    const errors: string[] = []
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text())
      }
    })
    
    await page.goto('/')
    
    await expect(page.getByText(/letsboulder/i)).toBeVisible({ timeout: 10000 })
    
    const criticalErrors = errors.filter(e => 
      !e.includes('favicon') && 
      !e.includes('404') &&
      !e.includes('Failed to load resource') &&
      !e.includes('cloudflareinsights') &&
      !e.includes('CORS policy') &&
      !e.includes('Service worker')
    )
    expect(criticalErrors).toHaveLength(0)
  })
})
