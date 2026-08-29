import { test, expect } from '@playwright/test'
import { source as axeSource } from 'axe-core'

import { AUDIT_VIEWPORTS } from './fixtures/runtime-audit'

async function expectNoSeriousAxeViolations(page: import('@playwright/test').Page) {
  await page.evaluate(axeSource)
  const violations = await page.evaluate(async () => {
    const axe = (window as typeof window & {
      axe: {
        run: () => Promise<{
          violations: Array<{ id: string; impact: string | null; nodes: unknown[] }>
        }>
      }
    }).axe
    const results = await axe.run()
    return results.violations.filter(({ impact }) => impact === 'serious' || impact === 'critical')
  })

  expect(violations, JSON.stringify(violations, null, 2)).toEqual([])
}

test.describe('Accessibility', () => {
  test('@full mobile navigation exposes dialog semantics and closes on escape', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/')

    await page.getByRole('button', { name: /open navigation menu/i }).click()

    const dialog = page.getByRole('dialog', { name: /navigation menu/i })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('navigation', { name: /more navigation/i })).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
  })

  test('@full header search exposes combobox results and keyboard selection', async ({ page }) => {
    await page.goto('/')

    const searchbox = page.getByRole('combobox', { name: /search all crags and climbs/i })
    await searchbox.fill('a')
    await searchbox.fill('ab')

    const listbox = page.getByRole('listbox', { name: /search results/i })
    const emptyState = page.getByText(/no crags or climbs matched/i)

    await expect(listbox.or(emptyState)).toBeVisible({ timeout: 10000 })

    if (await listbox.isVisible().catch(() => false)) {
      await expect(listbox.locator('[role="option"][aria-selected="true"]').first()).toBeVisible()
      await page.keyboard.press('ArrowDown')
      await expect(searchbox).toHaveAttribute('aria-expanded', 'true')
    }
  })

  test('@full desktop more navigation exposes disclosure semantics', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto('/')

    const trigger = page.getByRole('button', { name: /more navigation/i })
    await expect(trigger).toHaveAttribute('aria-expanded', 'false')

    await trigger.click()

    await expect(trigger).toHaveAttribute('aria-expanded', 'true')
    await expect(page.getByRole('navigation', { name: /more navigation/i })).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(trigger).toHaveAttribute('aria-expanded', 'false')
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

    const emailInput = page.getByRole('textbox', { name: 'Email' })
    await expect(emailInput).toBeVisible({ timeout: 10000 })
    await expect(emailInput).toHaveAttribute('autocomplete', 'email')
  })

  test('@full page has skip to main content link', async ({ page }) => {
    await page.goto('/')

    const skipLink = page.getByRole('link', { name: /skip to|skip main/i })
    await skipLink.first().focus()
    await expect(skipLink.first()).toBeVisible({ timeout: 10000 })

    await skipLink.first().click()
    await expect(page.locator('main#main-content')).toBeFocused()
  })

  const shellRoutes = [
    '/',
    '/about',
    '/impact',
    '/auth',
    '/gym-owners',
    '/gym-owners/apply',
    '/privacy',
    '/terms',
    '/cookies',
    '/open-data-terms',
    '/submit',
    '/logbook',
    '/this-route-does-not-exist',
  ]

  for (const route of shellRoutes) {
    test(`@full ${route} exposes one working main landmark`, async ({ page }) => {
      await page.goto(route)
      await expect(page.locator('main#main-content')).toHaveCount(1)
      await expect(page.locator('#main-content')).toHaveCount(1)
      await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
    })
  }

  test('@full normal crag and climb routes expose one main landmark and H1', async ({ page }) => {
    for (const route of ['/gb/harrisons-rocks', '/gb/harrisons-rocks/giants-ear']) {
      await page.goto(route)
      await expect(page.locator('main#main-content')).toHaveCount(1)
      await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
    }
  })

  test('@full about sections and impact metrics expose structural semantics', async ({ page }) => {
    await page.goto('/about')
    for (const name of ['Our Mission', 'How It Works', 'Community Features', 'Keep it free']) {
      await expect(page.getByRole('heading', { level: 2, name })).toBeVisible()
    }

    await page.goto('/impact')
    const metrics = page.locator('dl')
    await expect(metrics.locator('dt')).toHaveCount(6)
    await expect(metrics.locator('dd')).toHaveCount(12)
  })

  test('@full recovery page has a meaningful title and page heading', async ({ page }) => {
    await page.goto('/this-route-does-not-exist')
    await expect(page).toHaveTitle(/page not found/i)
    await expect(page.getByRole('heading', { level: 1, name: /page not found/i })).toBeVisible()
  })

  for (const viewport of AUDIT_VIEWPORTS.filter(({ width }) => width >= 320 && width <= 430)) {
    test(`@full shell navigation reflows at ${viewport.width}px`, async ({ page }) => {
      await page.setViewportSize(viewport)
      await page.goto('/')

      await expect(page.getByRole('navigation', { name: /mobile primary navigation/i })).toBeVisible()
      await expect(page.getByRole('link', { name: 'Map', exact: true })).toHaveAttribute('aria-current', 'page')
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)

      await page.goto('/privacy')
      await expect(page.getByRole('navigation', { name: /legal navigation/i })).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
    })
  }

  test('@full submit page has accessible form elements', async ({ page }) => {
    await page.goto('/submit')

    await expect(page).toHaveURL(/\/auth\?redirect_to=(%2Fsubmit|\/submit|%2Flogbook%2Fsubmissions|\/logbook\/submissions)/)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(page.getByRole('button', { name: /continue with google/i })).toBeVisible()
  })

  for (const route of ['/auth', '/gym-owners', '/gym-owners/apply', '/privacy', '/this-route-does-not-exist']) {
    test(`@full ${route} has no serious or critical axe violations`, async ({ page }) => {
      await page.goto(route)
      await expect(page.locator('main#main-content')).toBeVisible()
      await expectNoSeriousAxeViolations(page)
    })
  }
})
