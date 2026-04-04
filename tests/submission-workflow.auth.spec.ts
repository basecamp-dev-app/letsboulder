import fs from 'fs'
import path from 'path'
import { test, expect, type Locator, type Page } from '@playwright/test'
import globalSetup from '../global-setup'

const AUTH_STATE_PATH = path.resolve(process.cwd(), 'playwright/.auth/user.json')
const IMAGE_FIXTURE = path.join(__dirname, 'fixtures/IMG-20260223-WA0006~2.jpg')
const TEST_LATITUDE = '49.2001'
const TEST_LONGITUDE = '-2.1201'

test.use({ storageState: AUTH_STATE_PATH })

async function ensureAuthStateExists() {
  if (fs.existsSync(AUTH_STATE_PATH)) return

  if (process.env.CI) {
    throw new Error('Missing auth state after global setup')
  }

  if (process.env.TEST_API_KEY && process.env.TEST_USER_ID && process.env.TEST_USER_PASSWORD) {
    await globalSetup()
    if (fs.existsSync(AUTH_STATE_PATH)) return
  }

  throw new Error('Missing auth state and test auth credentials')
}

async function drawRoute(page: Page, canvas: Locator) {
  await expect(canvas).toBeVisible({ timeout: 20000 })
  const box = await canvas.boundingBox()
  if (!box) {
    throw new Error('Canvas bounding box unavailable')
  }

  const points = [
    { x: Math.max(50, Math.floor(box.width * 0.22)), y: Math.max(50, Math.floor(box.height * 0.3)) },
    { x: Math.max(90, Math.floor(box.width * 0.45)), y: Math.max(90, Math.floor(box.height * 0.52)) },
    { x: Math.max(120, Math.floor(box.width * 0.7)), y: Math.max(120, Math.floor(box.height * 0.64)) },
  ]

  for (const point of points) {
    await canvas.click({ position: point })
  }

  await expect(page.getByRole('button', { name: /^Save$/ })).toBeVisible({ timeout: 10000 })
}

test.describe.serial('Submission workflow', () => {
  test.beforeAll(async () => {
    await ensureAuthStateExists()
  })

  test('@full authenticated user can draft, draw, publish, and see submission in logbook', async ({ page }) => {
    const timestamp = Date.now()
    const routeName = `E2E Submission Workflow Route ${timestamp}`
    const cragName = `E2E Submission Workflow Crag ${timestamp}`

    await page.goto('/submit')
    await expect(page).not.toHaveURL(/\/auth/)
    await expect(page.getByRole('heading', { name: /Start a new draft/i })).toBeVisible()

    await page.locator('input[type="file"]').setInputFiles([IMAGE_FIXTURE])
    await expect(page.getByRole('button', { name: 'Continue to editor' })).toBeEnabled({ timeout: 30000 })
    await page.getByRole('button', { name: 'Continue to editor' }).click()

    await expect(page).toHaveURL(/\/logbook\/drafts\/[0-9a-f-]+\/edit/i, { timeout: 30000 })
    await expect(page.getByRole('button', { name: 'Save draft' })).toBeVisible({ timeout: 20000 })
    await expect(page.getByRole('button', { name: 'Publish' })).toBeVisible({ timeout: 20000 })

    const canvas = page.locator('canvas.cursor-crosshair')
    await drawRoute(page, canvas)
    await page.getByPlaceholder('Route name').fill(routeName)
    await page.getByRole('button', { name: /^Save$/ }).click()

    await page.getByLabel('Latitude').fill(TEST_LATITUDE)
    await page.getByLabel('Longitude').fill(TEST_LONGITUDE)

    await page.getByRole('button', { name: 'Select crag' }).click()
    await page.getByRole('button', { name: /\+ Create/i }).first().click()
    await page.getByPlaceholder('Enter crag name').fill(cragName)
    await page.getByRole('button', { name: 'Create Crag' }).click()

    await expect(page.getByText(cragName)).toBeVisible({ timeout: 15000 })

    await page.getByRole('button', { name: 'Save draft' }).click()
    await expect(page.getByText('Draft saved. Not published to the map.')).toBeVisible({ timeout: 20000 })

    await page.getByRole('button', { name: 'Publish' }).click()
    await expect(page).toHaveURL(/\/([a-z]{2})\/.+\/i\/[0-9a-f-]+/i, { timeout: 30000 })

    await page.goto('/logbook')
    await expect(page.getByText('Your submissions')).toBeVisible({ timeout: 20000 })
    await expect(page.getByText(cragName)).toBeVisible({ timeout: 20000 })
  })
})
