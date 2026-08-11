import { expect, test } from '@playwright/test'

const imageFirstUrl = process.env.IMAGE_FIRST_E2E_URL

test.describe('image-first navigation history', () => {
  test.skip(!imageFirstUrl, 'Set IMAGE_FIRST_E2E_URL to an image-first page with at least two images')

  test('restores the URL-driven active image through browser back and forward', async ({ page }) => {
    await page.goto(imageFirstUrl as string)
    const firstUrl = page.url()
    const previousButton = page.getByRole('button', { name: 'Prev' })
    const nextButton = page.getByRole('button', { name: 'Next' })

    await expect(previousButton).toBeDisabled()
    await expect(nextButton).toBeEnabled()
    await nextButton.click()
    await expect(page).not.toHaveURL(firstUrl)
    const secondUrl = page.url()
    await expect(previousButton).toBeEnabled()

    await page.goBack()
    await expect(page).toHaveURL(firstUrl)
    await expect(previousButton).toBeDisabled()

    await page.goForward()
    await expect(page).toHaveURL(secondUrl)
    await expect(previousButton).toBeEnabled()
  })
})
