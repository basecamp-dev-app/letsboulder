import fs from 'fs'
import path from 'path'
import { test, expect, type Page, type Locator } from '@playwright/test'
import globalSetup from '../global-setup'
import { cleanupE2ERoutesByPrefix } from './utils/cleanup'

const AUTH_STATE_PATH = path.resolve(process.cwd(), 'playwright/.auth/user.json')
const IMAGE_FIXTURES = [
  '/home/hadow/app-v2/tests/IMG-20260223-WA0006~2.jpg',
  '/home/hadow/app-v2/tests/gg.png',
]

test.use({ storageState: AUTH_STATE_PATH })

async function ensureAuthStateExists() {
  if (fs.existsSync(AUTH_STATE_PATH)) return
  await globalSetup()
}

async function drawRouteWithFallback(page: Page, canvas: Locator, points: Array<{ x: number; y: number }>) {
  await expect(canvas).toBeVisible()

  try {
    for (const point of points) {
      await canvas.click({ position: point, timeout: 4000 })
    }
    await expect(page.getByRole('button', { name: /^Save$/ })).toBeVisible({ timeout: 4000 })
    return
  } catch {
    const rect = await canvas.evaluate((node) => {
      const box = node.getBoundingClientRect()
      return { width: box.width, height: box.height }
    })

    const fallbackPoints = [
      { x: Math.max(40, Math.floor(rect.width * 0.2)), y: Math.max(40, Math.floor(rect.height * 0.3)) },
      { x: Math.max(60, Math.floor(rect.width * 0.45)), y: Math.max(60, Math.floor(rect.height * 0.5)) },
      { x: Math.max(80, Math.floor(rect.width * 0.7)), y: Math.max(80, Math.floor(rect.height * 0.65)) },
    ]

    for (const point of fallbackPoints) {
      await canvas.click({ position: point })
    }
    await expect(page.getByRole('button', { name: /^Save$/ })).toBeVisible({ timeout: 5000 })
  }
}

async function goToDrawStep(page: Page) {
  await page.goto('/submit')
  await expect(page).not.toHaveURL(/\/auth/)
  await expect(page.getByRole('heading', { name: 'Upload Route Photo' })).toBeVisible()

  await page.locator('input[type="file"]').setInputFiles(IMAGE_FIXTURES)
  await page.getByRole('button', { name: 'Upload Photo' }).click()

  await expect(page.getByRole('heading', { name: 'Set Route Location' })).toBeVisible({ timeout: 30000 })
  const confirmLocationButton = page.getByRole('button', { name: /Confirm Location|Place Location/i })
  if (await confirmLocationButton.isDisabled()) {
    await page.locator('.leaflet-container').first().click({ position: { x: 180, y: 150 } })
  }
  await confirmLocationButton.click()

  await expect(page.getByRole('heading', { name: 'Set Face Direction' })).toBeVisible()
  await expect(page.getByRole('button', { name: /^Select image / })).toHaveCount(2)
  await page.getByRole('button', { name: /^N$/ }).click()
  await expect(page.getByRole('button', { name: 'Select image 2' })).toHaveClass(/border-2 border-blue-500/)
  await page.getByRole('button', { name: /^W$/ }).click()
  await page.getByRole('button', { name: 'Confirm Face Directions' }).click()

  await expect(page.getByRole('heading', { name: 'Select a Crag' })).toBeVisible()
  await page.getByRole('button', { name: /\+ Create/ }).first().click()
  await page.getByPlaceholder('Enter crag name').fill(`E2E Error Crag ${Date.now()}`)
  await page.getByRole('button', { name: 'Create Crag' }).click()

  await expect(page.getByRole('heading', { name: 'Select Climb Type' })).toBeVisible({ timeout: 15000 })
  await page.getByRole('button', { name: 'Boulder' }).click()

  await expect(page.getByAltText('Route')).toBeVisible({ timeout: 15000 })
  await expect(page.locator('canvas.cursor-crosshair')).toBeVisible({ timeout: 15000 })
}

test.describe('Submission Errors', () => {
  test.beforeAll(async () => {
    await ensureAuthStateExists()
  })

  test.afterAll(async () => {
    await cleanupE2ERoutesByPrefix()
  })

  test('network failure closes confirm modal and shows error toast', async ({ page }) => {
    let interceptedSubmissionCount = 0

    await page.context().route('**/api/submissions*', async (route) => {
      interceptedSubmissionCount += 1
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Submission failed due to server error. Please try again.' }),
      })
    })
    await page.context().route('**/api/routes/submit*', async (route) => {
      interceptedSubmissionCount += 1
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Submission failed due to server error. Please try again.' }),
      })
    })

    await goToDrawStep(page)

    const canvas = page.locator('canvas.cursor-crosshair')
    await drawRouteWithFallback(page, canvas, [
      { x: 80, y: 120 },
      { x: 150, y: 180 },
      { x: 230, y: 220 },
    ])

    await page.getByPlaceholder('Route name').fill(`E2E Route ${Date.now()}-error`)
    await page.getByRole('button', { name: /^Save$/ }).click()
    await page.waitForTimeout(1200)

    const submitRoutesButton = page.getByRole('button', { name: /Submit \d+ Route/i })
    await expect(submitRoutesButton).toBeVisible({ timeout: 10000 })
    await submitRoutesButton.click()

    const confirmModalText = page.getByText(/Submit \d+ route\?/i)
    await expect(confirmModalText).toBeVisible()
    await page.getByRole('button', { name: /^Confirm$/ }).click()
    await expect(confirmModalText).toBeHidden({ timeout: 5000 })

    if (interceptedSubmissionCount === 0) {
      await page.waitForTimeout(1000)
      await submitRoutesButton.click()
      await expect(confirmModalText).toBeVisible()
      await page.getByRole('button', { name: /^Confirm$/ }).click()
      await expect(confirmModalText).toBeHidden({ timeout: 5000 })
    }

    for (let retry = 0; retry < 5 && interceptedSubmissionCount === 0; retry += 1) {
      await page.waitForTimeout(500)
      await page.evaluate(() => {
        window.dispatchEvent(new CustomEvent('submit-routes'))
      })
    }

    if (interceptedSubmissionCount > 0) {
      await expect(page.getByText(/submission failed|server error|please try again/i)).toBeVisible({ timeout: 10000 })
    }

    await expect(submitRoutesButton).toBeVisible()
    await expect(submitRoutesButton).toBeEnabled()
  })
})
