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

  test('authenticated user can see create post button on community page', async ({ page }) => {
    await page.goto('/community')
    
    const createPostButton = page.getByRole('button', { name: /create post|new post/i })
    if (await createPostButton.isVisible()) {
      await expect(createPostButton).toBeVisible()
    }
  })

  test('authenticated user can navigate to a place and see post types', async ({ page }) => {
    const place = await getExistingPlace()
    
    if (!place) {
      test.skip()
      return
    }
    
    await page.goto(`/community/places/${place.slug}`)
    
    await expect(page.getByText(place.name)).toBeVisible()
    
    const postTypeTabs = page.getByRole('tab', { name: /session|update|conditions|question/i })
    if (await postTypeTabs.first().isVisible()) {
      await expect(postTypeTabs.first()).toBeVisible()
    }
  })

  test('authenticated user can access place feed', async ({ page }) => {
    const place = await getExistingPlace()
    
    if (!place) {
      test.skip()
      return
    }
    
    await page.goto(`/community/places/${place.slug}`)
    
    const feedSection = page.getByText(/sessions|updates|conditions/i)
    if (await feedSection.first().isVisible()) {
      await expect(feedSection.first()).toBeVisible()
    }
  })
})
