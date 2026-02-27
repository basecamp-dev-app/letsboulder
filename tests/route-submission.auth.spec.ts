import fs from 'fs'
import path from 'path'
import { test, expect, type Locator, type Page } from '@playwright/test'
import globalSetup from '../global-setup'
import { cleanupE2ERoutesByPrefix } from './utils/cleanup'

const AUTH_STATE_PATH = path.resolve(process.cwd(), 'playwright/.auth/user.json')
const IMAGE_FIXTURES = [
  path.join(__dirname, 'fixtures/IMG-20260223-WA0006~2.jpg'),
  path.join(__dirname, 'fixtures/gg.png'),
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

    const saveButton = page.getByRole('button', { name: /^Save$/ })
    if (await saveButton.isVisible().catch(() => false)) return

    const box = await canvas.boundingBox()
    if (!box) {
      throw new Error('Canvas bounding box unavailable after fallback clicks')
    }

    const dragStart = {
      x: box.x + Math.max(32, box.width * 0.2),
      y: box.y + Math.max(32, box.height * 0.25),
    }
    const dragEnd = {
      x: box.x + Math.max(96, box.width * 0.72),
      y: box.y + Math.max(96, box.height * 0.7),
    }

    await page.mouse.move(dragStart.x, dragStart.y)
    await page.mouse.down()
    await page.mouse.move(dragEnd.x, dragEnd.y, { steps: 12 })
    await page.mouse.up()

    await expect(saveButton).toBeVisible({ timeout: 5000 })
  }
}

async function goToDrawStep(page: Page) {
  await page.goto('/submit')
  await expect(page).not.toHaveURL(/\/auth/)
  await expect(page.getByRole('heading', { name: 'Upload Route Photo' })).toBeVisible()

  await page.locator('input[type="file"]').setInputFiles(IMAGE_FIXTURES)
  await expect(page.getByText(/Compressing/i)).not.toBeVisible({ timeout: 15000 })
  await page.getByRole('button', { name: /Upload|Batch|Next|Continue/i }).click()

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
  await page.getByPlaceholder('Enter crag name').fill(`E2E Crag ${Date.now()}`)
  await page.getByRole('button', { name: 'Create Crag' }).click()

  await expect(page.getByRole('heading', { name: 'Select Climb Type' })).toBeVisible({ timeout: 15000 })
  await page.getByRole('button', { name: 'Boulder' }).click()

  await expect(page.getByAltText('Route')).toBeVisible({ timeout: 15000 })
  await expect(page.locator('canvas.cursor-crosshair')).toBeVisible({ timeout: 15000 })
}

test.describe('Route Submission', () => {
  test.beforeAll(async () => {
    await ensureAuthStateExists()
  })

  test.afterAll(async () => {
    await cleanupE2ERoutesByPrefix()
  })

  test('authenticated user can upload, draw, and submit a route', async ({ page }) => {
    await goToDrawStep(page)

    const firstFaceCanvas = page.locator('canvas.cursor-crosshair')
    await drawRouteWithFallback(page, firstFaceCanvas, [
      { x: 80, y: 120 },
      { x: 150, y: 180 },
      { x: 230, y: 220 },
    ])

    const routeBaseName = `E2E Route ${Date.now()}`
    await page.getByPlaceholder('Route name').fill(`${routeBaseName} Face 1`)
    await page.getByRole('button', { name: /^Save$/ }).click()

    const submitFirstFaceButton = page.getByRole('button', { name: /Submit \d+ Route/i })
    await expect(submitFirstFaceButton).toBeVisible({ timeout: 10000 })
    await submitFirstFaceButton.click()

    await expect(page.getByText(/Submit \d+ route\?/i)).toBeVisible()
    await page.getByRole('button', { name: /^Confirm$/ }).click()

    await expect(page.getByText('Face 2 of 2')).toBeVisible({ timeout: 20000 })
    await expect(page.getByAltText('Route')).toHaveAttribute('src', /gg\.png/)

    const secondFaceCanvas = page.locator('canvas.cursor-crosshair')
    await drawRouteWithFallback(page, secondFaceCanvas, [
      { x: 70, y: 110 },
      { x: 140, y: 175 },
      { x: 215, y: 235 },
    ])

    await page.getByPlaceholder('Route name').fill(`${routeBaseName} Face 2`)
    await page.getByRole('button', { name: /^Save$/ }).click()

    const submitFinalFaceButton = page.getByRole('button', { name: /Submit \d+ Route/i })
    await expect(submitFinalFaceButton).toBeVisible({ timeout: 10000 })
    await submitFinalFaceButton.click()

    await expect(page.getByText(/Submit \d+ route\?/i)).toBeVisible()
    await page.getByRole('button', { name: /^Confirm$/ }).click()

    await expect(page.getByRole('heading', { name: 'Routes Submitted!' })).toBeVisible({ timeout: 20000 })
    await page.getByRole('link', { name: /View Routes on Image/i }).click()
    await expect(page.locator('p').filter({ hasText: /2 faces/i }).first()).toBeVisible({ timeout: 20000 })
    await expect(page.getByRole('link', { name: /Go to Logbook/i })).toBeVisible()
  })

  test('draft survives page reload via localStorage', async ({ page }) => {
    await goToDrawStep(page)

    const canvas = page.locator('canvas.cursor-crosshair')
    await drawRouteWithFallback(page, canvas, [
      { x: 90, y: 130 },
      { x: 170, y: 200 },
      { x: 250, y: 240 },
    ])

    await page.waitForTimeout(900)

    const draftBeforeReload = await page.evaluate(() => {
      const keys = Object.keys(window.localStorage).filter((key) => key.startsWith('submit-route-draft:'))
      if (keys.length === 0) return { exists: false, key: null as string | null, pointsCount: 0 }

      const key = keys[0]
      const raw = window.localStorage.getItem(key)
      if (!raw) return { exists: false, key, pointsCount: 0 }

      try {
        const parsed = JSON.parse(raw) as { currentPoints?: Array<unknown> }
        const pointsCount = Array.isArray(parsed.currentPoints) ? parsed.currentPoints.length : 0
        return { exists: true, key, pointsCount }
      } catch {
        return { exists: true, key, pointsCount: 0 }
      }
    })

    expect(draftBeforeReload.exists).toBeTruthy()
    expect(draftBeforeReload.pointsCount).toBeGreaterThanOrEqual(3)

    await page.reload()

    const canvasVisibleAfterReload = await page.locator('canvas.cursor-crosshair').isVisible().catch(() => false)
    if (!canvasVisibleAfterReload) {
      await expect(page.getByRole('button', { name: /Resume draft/i })).toBeVisible({ timeout: 15000 })
    }

    const draftAfterReload = await page.evaluate((expectedKey) => {
      const key = expectedKey || Object.keys(window.localStorage).find((item) => item.startsWith('submit-route-draft:')) || null
      if (!key) return { exists: false, pointsCount: 0 }

      const raw = window.localStorage.getItem(key)
      if (!raw) return { exists: false, pointsCount: 0 }

      try {
        const parsed = JSON.parse(raw) as { currentPoints?: Array<unknown> }
        const pointsCount = Array.isArray(parsed.currentPoints) ? parsed.currentPoints.length : 0
        return { exists: true, pointsCount }
      } catch {
        return { exists: true, pointsCount: 0 }
      }
    }, draftBeforeReload.key)

    expect(draftAfterReload.exists).toBeTruthy()
    expect(draftAfterReload.pointsCount).toBeGreaterThanOrEqual(3)
  })
})
