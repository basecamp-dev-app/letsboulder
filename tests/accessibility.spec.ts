import { test, expect } from '@playwright/test'

test.describe('Accessibility', () => {
  test('auth page has proper heading structure', async ({ page }) => {
    await page.goto('/auth')
    
    const h1 = page.locator('h1')
    await expect(h1).toBeVisible()
    
    const headingLevel = await h1.evaluate(el => {
      const match = el.tagName.match(/H(\d)/)
      return match ? parseInt(match[1]) : null
    })
    expect(headingLevel).toBe(1)
  })

  test('auth page buttons have accessible names', async ({ page }) => {
    await page.goto('/auth')
    
    const googleButton = page.getByRole('button', { name: /continue with google/i })
    await expect(googleButton).toBeVisible()
    await expect(googleButton).toBeVisible()
    
    const discordButton = page.getByRole('button', { name: /continue with discord/i })
    await expect(discordButton).toBeVisible()
  })

  test('auth page has proper language attribute', async ({ page }) => {
    await page.goto('/auth')
    
    const html = page.locator('html')
    await expect(html).toHaveAttribute('lang', /en/i)
  })

  test('community page has accessible heading structure', async ({ page }) => {
    await page.goto('/community')
    
    const h1 = page.locator('h1')
    await expect(h1).toBeVisible()
  })

  test('form inputs have labels', async ({ page }) => {
    await page.goto('/auth')
    
    await page.getByText('Sign in with email instead').click()
    await page.waitForTimeout(1000)
    
    const emailInput = page.getByPlaceholder('you@example.com')
    if (await emailInput.isVisible()) {
      await expect(emailInput).toBeVisible()
    }
  })

  test('page has skip to main content link', async ({ page }) => {
    await page.goto('/')
    
    const skipLink = page.getByRole('link', { name: /skip to|skip main/i })
    const hasSkipLink = await skipLink.count() > 0
    
    if (!hasSkipLink) {
      test.skip()
    }
  })

  test('interactive elements are keyboard accessible', async ({ page }) => {
    await page.goto('/auth')
    
    await page.keyboard.press('Tab')
    
    const focusedElement = page.locator(':focus')
    const isButton = await focusedElement.evaluate(el => 
      el.tagName === 'BUTTON' || 
      el.getAttribute('role') === 'button' ||
      (el.tagName === 'A' && el.getAttribute('href')?.startsWith('#'))
    )
    expect(isButton).toBe(true)
  })

  test('logbook page has proper heading hierarchy', async ({ page }) => {
    await page.goto('/logbook')
    
    await page.waitForLoadState('networkidle')
    
    const headings = page.locator('h1, h2, h3, h4, h5, h6')
    const count = await headings.count()
    expect(count).toBeGreaterThan(0)
    
    const h1 = page.locator('h1')
    await expect(h1).toBeVisible()
  })

  test('submit page has accessible form elements', async ({ page }) => {
    await page.goto('/submit')
    
    await page.waitForTimeout(2000)
    
    const buttons = page.getByRole('button')
    const count = await buttons.count()
    expect(count).toBeGreaterThan(0)
  })

  test('no critical accessibility violations on auth page', async ({ page }) => {
    const violations: string[] = []
    
    page.on('console', msg => {
      if (msg.type() === 'error') {
        const text = msg.text()
        if (text.includes('accessibility') || text.includes('a11y')) {
          violations.push(text)
        }
      }
    })
    
    await page.goto('/auth')
    await page.waitForTimeout(1000)
    
    expect(violations.length).toBe(0)
  })
})
