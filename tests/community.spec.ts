import { test, expect } from '@playwright/test'
import { getExistingPlace } from './utils/test-community'

test.describe('Community', () => {
  test('community page loads and displays places', async ({ page }) => {
    await page.goto('/community')
    
    await expect(page.getByRole('heading', { name: 'Community' })).toBeVisible()
    await expect(page.getByText('Pick a place to see upcoming sessions')).toBeVisible()
  })

  test('place page loads with tabs', async ({ page }) => {
    const place = await getExistingPlace()
    
    if (!place) {
      test.skip()
      return
    }
    
    await page.goto(`/community/places/${place.slug}`)
    
    await expect(page.getByText(place.name)).toBeVisible()
  })

  test('rankings link is visible on community page', async ({ page }) => {
    await page.goto('/community')
    
    await expect(page.getByRole('link', { name: /open global rankings/i })).toBeVisible()
  })
})
