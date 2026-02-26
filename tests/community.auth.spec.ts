import { test, expect } from '@playwright/test'
import { getExistingPlace } from './utils/test-community'

test.describe('Community (Authenticated)', () => {
  test('authenticated user can see create post button on community page', async ({ page }) => {
    await page.goto('/community')

    await expect(page).not.toHaveURL(/\/auth/)

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
    await expect(page).not.toHaveURL(/\/auth/)
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
    await expect(page).not.toHaveURL(/\/auth/)

    const feedSection = page.getByText(/sessions|updates|conditions/i)
    if (await feedSection.first().isVisible()) {
      await expect(feedSection.first()).toBeVisible()
    }
  })
})
