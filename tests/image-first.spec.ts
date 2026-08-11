import { expect, test, type APIRequestContext } from '@playwright/test'

const imageFirstUrl = process.env.IMAGE_FIRST_E2E_URL

async function resolveImageFirstUrls(request: APIRequestContext) {
  if (imageFirstUrl) return [imageFirstUrl]

  const response = await request.get('/sitemaps/climbs/0.xml')
  expect(response.ok(), 'The climbs sitemap must be available for image-first smoke discovery').toBe(true)

  const xml = await response.text()
  const paths = new Set<string>()

  for (const match of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) {
    const url = new URL(match[1].replaceAll('&amp;', '&'))
    if (!/^\/(?:[^/]+)\/(?:[^/]+)\/i\/[^/]+$/.test(url.pathname)) continue
    paths.add(`${url.pathname}${url.search}`)
  }

  expect(paths.size, 'The climbs sitemap must contain an image-first page').toBeGreaterThan(0)
  return Array.from(paths)
}

function getImageId(url: string) {
  const imageId = new URL(url).pathname.split('/').at(-1)
  expect(imageId, `Expected an image ID in ${url}`).toBeTruthy()
  return imageId as string
}

test.describe('image-first navigation history', () => {
  test('@smoke restores the URL-driven active image through browser back and forward', async ({ page, request }) => {
    const previousButton = page.getByRole('button', { name: 'Prev' })
    const nextButton = page.getByRole('button', { name: 'Next' })
    const viewer = page.locator('main[data-active-image-id]')
    const candidates = await resolveImageFirstUrls(request)
    let foundNavigablePage = false

    for (const candidate of candidates.slice(0, 20)) {
      await page.goto(candidate)
      await expect(previousButton).toBeVisible()
      await expect(nextButton).toBeVisible()
      if (await previousButton.isEnabled() || await nextButton.isEnabled()) {
        foundNavigablePage = true
        break
      }
    }

    expect(foundNavigablePage, 'The climbs sitemap must lead to a crag with at least two images').toBe(true)
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
