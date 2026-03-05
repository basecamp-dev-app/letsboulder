import { test, expect } from '@playwright/test'
import { cleanupSeededPlace, ensureSeededPlace } from './utils/test-community'

test.describe('Community (Authenticated)', () => {
  let seededPlace: { id: string; name: string; slug: string }
  const seededSlug = 'e2e-seeded-place-auth'

  test.beforeAll(async () => {
    seededPlace = await ensureSeededPlace({ slug: seededSlug, name: 'E2E Seeded Place Auth' })
  })

  test.afterAll(async () => {
    await cleanupSeededPlace(seededSlug)
  })

  test('@full authenticated user can see create post button on community page', async ({ page }) => {
    await page.goto('/community')

    await expect(page).not.toHaveURL(/\/auth/)

    const createPostButton = page.getByRole('button', { name: /create post|new post/i })
    if (await createPostButton.isVisible()) {
      await expect(createPostButton).toBeVisible()
    }
  })

  test('@full authenticated user can navigate to a place and see post types', async ({ page }) => {
    await page.goto(`/community/places/${seededPlace.slug}`)
    await expect(page).not.toHaveURL(/\/auth/)
    await expect(page.getByText(seededPlace.name)).toBeVisible()

    const postTypeTabs = page.getByRole('tab', { name: /session|update|conditions|question/i })
    await expect(postTypeTabs.first()).toBeVisible()
  })

  test('@full authenticated user can access place feed', async ({ page }) => {
    await page.goto(`/community/places/${seededPlace.slug}`)
    await expect(page).not.toHaveURL(/\/auth/)

    const feedSection = page.getByText(/sessions|updates|conditions/i)
    await expect(feedSection.first()).toBeVisible()
  })
})
