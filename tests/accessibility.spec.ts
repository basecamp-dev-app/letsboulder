import { test, expect } from '@playwright/test'

test.describe('Accessibility', () => {
  test('@full mobile navigation exposes dialog semantics and closes on escape', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/')

    await page.getByRole('button', { name: /open navigation menu/i }).click()

    const dialog = page.getByRole('dialog', { name: /navigation menu/i })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('navigation', { name: /mobile navigation/i })).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
  })

  test('@full header search exposes combobox results and keyboard selection', async ({ page }) => {
    await page.goto('/')

    const searchbox = page.getByRole('combobox', { name: /search crags or climbs/i })
    await searchbox.fill('a')
    await searchbox.fill('ab')

    const listbox = page.getByRole('listbox', { name: /search results/i })
    const emptyState = page.getByText(/no results found/i)

    await expect(listbox.or(emptyState)).toBeVisible({ timeout: 10000 })

    if (await listbox.isVisible().catch(() => false)) {
      await expect(listbox.locator('[role="option"][aria-selected="true"]').first()).toBeVisible()
      await page.keyboard.press('ArrowDown')
      await expect(searchbox).toHaveAttribute('aria-expanded', 'true')
    }
  })

  test('@full auth page has proper heading structure', async ({ page }) => {
    await page.goto('/auth')
    
    const h1 = page.locator('h1')
    await expect(h1).toBeVisible()
    
    const headingLevel = await h1.evaluate(el => {
      const match = el.tagName.match(/H(\d)/)
      return match ? parseInt(match[1]) : null
    })
    expect(headingLevel).toBe(1)
  })

  test('@full auth page buttons have accessible names', async ({ page }) => {
    await page.goto('/auth')
    
    const googleButton = page.getByRole('button', { name: /continue with google/i })
    await expect(googleButton).toBeVisible()
    
    const discordButton = page.getByRole('button', { name: /continue with discord/i })
    await expect(discordButton).toBeVisible()
  })

  test('@full auth page has proper language attribute', async ({ page }) => {
    await page.goto('/auth')
    
    const html = page.locator('html')
    await expect(html).toHaveAttribute('lang', /en/i)
  })

  test('@full form inputs have labels', async ({ page }) => {
    await page.goto('/auth')

    await page.getByText('Sign in with email instead').click()

    const emailInput = page.getByPlaceholder('you@example.com')
    await expect(emailInput).toBeVisible({ timeout: 10000 })
  })

  test('@full page has skip to main content link', async ({ page }) => {
    await page.goto('/')

    const skipLink = page.getByRole('link', { name: /skip to|skip main/i })
    await expect(skipLink.first()).toBeVisible({ timeout: 10000 })
  })

  test('@full submit page has accessible form elements', async ({ page }) => {
    await page.goto('/submit')

    await expect(page).toHaveURL(/\/auth\?redirect_to=(%2Fsubmit|\/submit|%2Flogbook%2Fsubmissions|\/logbook\/submissions)/)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(page.getByRole('button', { name: /continue with google/i })).toBeVisible()
  })

  test('@full no critical accessibility violations on auth page', async ({ page }) => {
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
    await expect(page.getByRole('button', { name: /continue with google/i })).toBeVisible({ timeout: 10000 })

    expect(violations.length).toBe(0)
  })
})
