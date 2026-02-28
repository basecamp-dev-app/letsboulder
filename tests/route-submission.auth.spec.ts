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
  await page.getByRole('button', { name: 'Upload Batch', exact: true }).click()

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

async function getCanvasPointByAlpha(
  canvas: Locator,
  mode: 'painted' | 'empty'
): Promise<{ x: number; y: number }> {
  const point = await canvas.evaluate((node, targetMode) => {
    const el = node as HTMLCanvasElement
    const ctx = el.getContext('2d')
    if (!ctx || el.width <= 0 || el.height <= 0) return null

    const { data, width, height } = ctx.getImageData(0, 0, el.width, el.height)

    const isPainted = (alpha: number) => alpha > 0
    const shouldMatch = (alpha: number) => targetMode === 'painted' ? isPainted(alpha) : !isPainted(alpha)

    const step = 3
    for (let y = 2; y < height - 2; y += step) {
      for (let x = 2; x < width - 2; x += step) {
        const alpha = data[(y * width + x) * 4 + 3]
        if (shouldMatch(alpha)) {
          return { x, y }
        }
      }
    }

    return null
  }, mode)

  if (!point) {
    throw new Error(`Could not find a ${mode} canvas point`)
  }

  return point
}

function getRouteParam(currentUrl: string): string | null {
  return new URL(currentUrl).searchParams.get('route')
}

async function goToFaceTwo(page: Page, routeBaseName: string) {
  const alreadyOnFace2 = await page.getByRole('heading', { level: 1, name: /Face 2$/ }).isVisible().catch(() => false)
  if (alreadyOnFace2) {
    return
  }

  try {
    await page.getByRole('button', { name: 'Next face' }).click({ timeout: 5000, force: true })
  } catch {
    await page.getByRole('button', { name: 'Go to face 2' }).click({ timeout: 5000 })
  }

  await expect(page.getByRole('heading', { level: 1, name: `${routeBaseName} Face 2` })).toBeVisible({ timeout: 20000 })
}

test.describe.serial('Route Submission', () => {
  test.beforeAll(async () => {
    await ensureAuthStateExists()
  })

  test.afterAll(async () => {
    await cleanupE2ERoutesByPrefix()
  })

  test('authenticated user can upload, draw, and submit a route', async ({ page }) => {
    await goToDrawStep(page)

    const firstFaceSrc = await page.getByAltText('Route').getAttribute('src')
    expect(firstFaceSrc).toMatch(/.*\/storage\/v1\/object\/sign\/.*/)

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

    const routeImage = page.getByAltText('Route')
    await expect(routeImage).toHaveAttribute('src', /.*\/storage\/v1\/object\/sign\/.*/)
    const secondFaceSrc = await routeImage.getAttribute('src')
    expect(secondFaceSrc).not.toBe(firstFaceSrc)

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

    const viewRoutesLink = page.getByRole('link', { name: /View Routes on Image/i })
    const href = await viewRoutesLink.getAttribute('href')

    await page.goto(href!, { waitUntil: 'networkidle' })
    await expect(page.getByText(/\d+ route/)).toBeVisible({ timeout: 30000 })

    await page.waitForTimeout(2000)

    const initialImage = page.getByRole('img').first()
    await expect(initialImage).toBeVisible({ timeout: 20000 })

    const viewerHeading = page.getByRole('heading', { level: 1 }).filter({ hasText: /E2E Route|route/i }).first()
    await expect(viewerHeading).toBeVisible({ timeout: 20000 })
    const viewerHeadingText = (await viewerHeading.textContent())?.trim() || routeBaseName
    const startedOnFaceOne = /Face 1$/.test(viewerHeadingText)

    const routeImageVisible = page.getByRole('img', { name: viewerHeadingText }).first()
    await expect(routeImageVisible).toBeVisible({ timeout: 20000 })
    const viewerInitialSrc = await routeImageVisible.getAttribute('src')
    expect(viewerInitialSrc).toMatch(/.*\/storage\/v1\/object\/sign\/.*/)

    const viewerCanvas = page.locator('canvas.cursor-pointer').first()
    await expect(viewerCanvas).toBeVisible({ timeout: 20000 })
    await expect(viewerCanvas).toHaveAttribute('data-ready-state', 'idle', { timeout: 20000 })

    await goToFaceTwo(page, routeBaseName)

    const viewerFace2Image = page.getByRole('img', { name: `${routeBaseName} Face 2` }).first()
    await expect(viewerFace2Image).toBeVisible({ timeout: 20000 })
    const viewerFace2Src = await viewerFace2Image.getAttribute('src')
    expect(viewerFace2Src).toMatch(/.*\/storage\/v1\/object\/sign\/.*/)
    if (startedOnFaceOne) {
      expect(viewerFace2Src).not.toBe(viewerInitialSrc)
    }

    const expectedFace2RouteId = getRouteParam(page.url())
    expect(expectedFace2RouteId).toBeTruthy()

    const emptyPoint = await getCanvasPointByAlpha(viewerCanvas, 'empty')
    await viewerCanvas.click({ position: emptyPoint })
    await expect.poll(() => getRouteParam(page.url()), { timeout: 5000 }).toBeNull()

    await expect(viewerCanvas).toHaveAttribute('data-ready-state', 'idle', { timeout: 10000 })

    const canvasBox = await viewerCanvas.boundingBox()
    if (!canvasBox) {
      throw new Error('Viewer canvas bounding box unavailable')
    }

    const targetX = Number(await viewerCanvas.getAttribute('data-route-target-x'))
    const targetY = Number(await viewerCanvas.getAttribute('data-route-target-y'))
    if (!Number.isFinite(targetX) || !Number.isFinite(targetY)) {
      throw new Error('Viewer route target coordinates unavailable')
    }

    await viewerCanvas.click({
      position: {
        x: Math.floor(canvasBox.width * targetX),
        y: Math.floor(canvasBox.height * targetY),
      },
    })

    await expect.poll(() => getRouteParam(page.url()), { timeout: 10000 }).toBe(expectedFace2RouteId)

    await page.reload()
    await expect(page.getByRole('heading', { level: 1, name: new RegExp(routeBaseName) })).toBeVisible({ timeout: 30000 })

    const goToFaceOneButton = page.getByRole('button', { name: 'Go to face 1' })
    const hasFaceOneButton = await goToFaceOneButton.isVisible().catch(() => false)

    if (hasFaceOneButton) {
      await goToFaceOneButton.click()
      await expect(page.getByRole('heading', { level: 1, name: `${routeBaseName} Face 1` })).toBeVisible({ timeout: 20000 })
      await goToFaceTwo(page, routeBaseName)
    }

    const viewLogbookButton = page.getByRole('button', { name: /View Logbook/i })
    const topNavLogbookLink = page.getByRole('link', { name: /^Logbook$/i }).first()

    await expect.poll(async () => {
      const hasInlineCta = await viewLogbookButton.isVisible().catch(() => false)
      const hasTopNavLink = await topNavLogbookLink.isVisible().catch(() => false)
      return hasInlineCta || hasTopNavLink
    }, { timeout: 10000 }).toBeTruthy()
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
