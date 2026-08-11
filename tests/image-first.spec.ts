import { expect, test } from '@playwright/test'

const imageFirstUrl = process.env.IMAGE_FIRST_E2E_URL

function getImageId(url: string) {
  const imageId = new URL(url).pathname.split('/').at(-1)
  expect(imageId, `Expected an image ID in ${url}`).toBeTruthy()
  return imageId as string
}

test.describe('image-first navigation history', () => {
  test.skip(!imageFirstUrl, 'Set IMAGE_FIRST_E2E_URL to a maintained image-first fixture with at least two images')

  test('@smoke restores the URL-driven active image through browser back and forward', async ({ page }) => {
    const previousButton = page.getByRole('button', { name: 'Prev' })
    const nextButton = page.getByRole('button', { name: 'Next' })
    const viewer = page.locator('main[data-active-image-id]')
    expect(imageFirstUrl, 'IMAGE_FIRST_E2E_URL must be a same-origin image-first path').toMatch(/^\/[a-z]{2}\/[^/]+\/i\/[^/?]+(?:\?.*)?$/)
    await page.goto(imageFirstUrl as string)
    await expect(previousButton).toBeVisible()
    await expect(nextButton).toBeVisible()
    expect(await previousButton.isEnabled() || await nextButton.isEnabled(), 'The maintained fixture must have at least two images').toBe(true)
    await expect(viewer).toHaveAttribute('data-active-image-id', getImageId(page.url()))

    for (let attempt = 0; attempt < 50 && await previousButton.isEnabled(); attempt += 1) {
      const currentUrl = page.url()
      await previousButton.click()
      await expect(page).not.toHaveURL(currentUrl)
      await expect(viewer).toHaveAttribute('data-active-image-id', getImageId(page.url()))
    }

    await expect(previousButton).toBeDisabled()
    await expect(nextButton).toBeEnabled()
    const firstUrl = page.url()

    await nextButton.click()
    await expect(page).not.toHaveURL(firstUrl)
    const secondUrl = page.url()
    await expect(viewer).toHaveAttribute('data-active-image-id', getImageId(secondUrl))
    await expect(previousButton).toBeEnabled()

    await page.goBack()
    await expect(page).toHaveURL(firstUrl)
    await expect(viewer).toHaveAttribute('data-active-image-id', getImageId(firstUrl))
    await expect(previousButton).toBeDisabled()

    await page.goForward()
    await expect(page).toHaveURL(secondUrl)
    await expect(viewer).toHaveAttribute('data-active-image-id', getImageId(secondUrl))
    await expect(previousButton).toBeEnabled()
  })
})
