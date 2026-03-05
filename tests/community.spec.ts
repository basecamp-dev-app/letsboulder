import { test, expect } from '@playwright/test'
import { cleanupSeededPlace, ensureSeededPlace } from './utils/test-community'

test.describe('Community', () => {
  let seededPlace: { id: string; name: string; slug: string }
  const seededSlug = 'e2e-seeded-place-public'

  test.beforeAll(async () => {
    seededPlace = await ensureSeededPlace({ slug: seededSlug, name: 'E2E Seeded Place Public' })
  })

  test.afterAll(async () => {
    await cleanupSeededPlace(seededSlug)
  })

  test('@full community page loads and displays places', async ({ page }) => {
    await page.goto('/community')
    
    await expect(page.getByRole('heading', { name: 'Community' })).toBeVisible()
    await expect(page.getByText('Pick a place to see upcoming sessions')).toBeVisible()
  })

  test('@full place page loads with tabs', async ({ page }) => {
    await page.goto(`/community/places/${seededPlace.slug}`)

    await expect(page.getByText(seededPlace.name)).toBeVisible()
  })

  test('@full rankings link is visible on community page', async ({ page }) => {
    await page.goto('/community')
    
    await expect(page.getByRole('link', { name: /open global rankings/i })).toBeVisible()
  })
})
