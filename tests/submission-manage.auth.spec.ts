import fs from 'fs'
import path from 'path'
import { test, expect, type Locator, type Page } from '@playwright/test'
import globalSetup from '../global-setup'
import { createTestUser, deleteTestUser } from './utils/test-user'
import { cleanupE2ERoutesByPrefix } from './utils/cleanup'
import { supabaseAdmin } from './utils/supabase-admin'

const AUTH_STATE_PATH = path.resolve(process.cwd(), 'playwright/.auth/user.json')
const IMAGE_FIXTURES = [
  path.join(__dirname, 'fixtures/IMG-20260223-WA0006~2.jpg'),
]
const ROUTE_PREFIX = 'E2E Manage Vote'

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
  await expect(canvas).toBeVisible({ timeout: 15000 })
  const box = await canvas.boundingBox()
  if (!box) {
    throw new Error('Canvas bounding box unavailable')
  }

  const points = [
    { x: Math.floor(box.width * 0.2), y: Math.floor(box.height * 0.3) },
    { x: Math.floor(box.width * 0.46), y: Math.floor(box.height * 0.5) },
    { x: Math.floor(box.width * 0.7), y: Math.floor(box.height * 0.62) },
  ]

  for (const point of points) {
    await canvas.click({ position: point })
  }
}

async function submitSingleRoute(page: Page, routeName: string) {
  await page.goto('/submit')
  await expect(page).not.toHaveURL(/\/auth/)
  await expect(page.getByRole('heading', { name: 'Upload Route Photo' })).toBeVisible()

  await page.locator('input[type="file"]').setInputFiles(IMAGE_FIXTURES)
  await expect(page.getByText(/Compressing/i)).not.toBeVisible({ timeout: 15000 })
  await page.getByRole('button', { name: /^Upload\s+\d+\s+Photo/i }).click()

  await expect(page.getByRole('heading', { name: 'Set Route Location' })).toBeVisible({ timeout: 30000 })
  const confirmLocationButton = page.getByRole('button', { name: /Confirm Location|Place Location/i })
  if (await confirmLocationButton.isDisabled()) {
    await page.locator('.leaflet-container').first().click({ position: { x: 180, y: 150 } })
  }
  await confirmLocationButton.click()

  await expect(page.getByRole('heading', { name: 'Set Face Direction' })).toBeVisible()
  await page.getByRole('button', { name: /^N$/ }).first().click()
  await page.getByRole('button', { name: 'Confirm Face Directions' }).click()

  await expect(page.getByRole('heading', { name: 'Select a Crag' })).toBeVisible()
  await page.getByRole('button', { name: /\+ Create/ }).first().click()
  await page.getByPlaceholder('Enter crag name').fill(`E2E Crag ${Date.now()}`)
  await page.getByRole('button', { name: 'Create Crag' }).click()

  await expect(page.getByRole('heading', { name: 'Select Climb Type' })).toBeVisible({ timeout: 15000 })
  await page.getByRole('button', { name: 'Boulder' }).click()

  const canvas = page.locator('canvas.cursor-crosshair')
  await drawRoute(page, canvas)
  await page.getByPlaceholder('Route name').fill(routeName)
  await page.getByRole('button', { name: /^Save$/ }).click()

  const submitButton = page.getByRole('button', { name: /Submit \d+ Route/i })
  await expect(submitButton).toBeVisible({ timeout: 10000 })
  await submitButton.click()

  const confirmModal = page.getByText(/Submit \d+ route\?/i)
  if (await confirmModal.isVisible().catch(() => false)) {
    await page.getByRole('button', { name: /^Confirm$/ }).click()
  }

  await expect(page.getByRole('heading', { name: 'Routes Submitted!' })).toBeVisible({ timeout: 20000 })
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
    const shouldMatch = (alpha: number) => targetMode === 'painted' ? alpha > 0 : alpha === 0

    const step = 3
    for (let y = 2; y < height - 2; y += step) {
      for (let x = 2; x < width - 2; x += step) {
        const alpha = data[(y * width + x) * 4 + 3]
        if (shouldMatch(alpha)) return { x, y }
      }
    }

    return null
  }, mode)

  if (!point) {
    throw new Error(`Could not find a ${mode} canvas point`)
  }

  return point
}

test.describe.serial('Submission manage grade voting', () => {
  const createdUserIds: string[] = []

  test.setTimeout(180000)

  test.beforeAll(async () => {
    await ensureAuthStateExists()
  })

  test.afterAll(async () => {
    for (const userId of createdUserIds) {
      await deleteTestUser(userId)
    }
    await cleanupE2ERoutesByPrefix(ROUTE_PREFIX)
  })

  test('manage-grade vote applies one vote per owner and collaborator', async ({ page }) => {
    const routeName = `${ROUTE_PREFIX} ${Date.now()}`
    await submitSingleRoute(page, routeName)

    const { data: climbRow, error: climbError } = await supabaseAdmin
      .from('climbs')
      .select('id, user_id')
      .eq('name', routeName)
      .single()

    if (climbError || !climbRow) {
      throw new Error(`Failed to find created climb: ${climbError?.message || 'missing row'}`)
    }

    const { data: routeLineRow, error: routeLineError } = await supabaseAdmin
      .from('route_lines')
      .select('id, image_id')
      .eq('climb_id', climbRow.id)
      .single()

    if (routeLineError || !routeLineRow) {
      throw new Error(`Failed to find created route line: ${routeLineError?.message || 'missing row'}`)
    }

    const collaboratorOne = await createTestUser()
    const collaboratorTwo = await createTestUser()
    createdUserIds.push(collaboratorOne.id, collaboratorTwo.id)

    const { error: collaboratorInsertError } = await supabaseAdmin
      .from('submission_collaborators')
      .insert([
        { image_id: routeLineRow.image_id, user_id: collaboratorOne.id, role: 'editor', created_by: climbRow.user_id },
        { image_id: routeLineRow.image_id, user_id: collaboratorTwo.id, role: 'editor', created_by: climbRow.user_id },
      ])

    if (collaboratorInsertError) {
      throw new Error(`Failed to insert collaborators: ${collaboratorInsertError.message}`)
    }

    await page.goto(`/logbook/submissions/${routeLineRow.image_id}/edit`)
    await expect(page.getByRole('button', { name: 'Save all changes' })).toBeVisible({ timeout: 20000 })

    const editCanvas = page.locator('canvas.cursor-crosshair')
    await expect(editCanvas).toBeVisible({ timeout: 20000 })
    const paintedPoint = await getCanvasPointByAlpha(editCanvas, 'painted')
    await editCanvas.click({ position: paintedPoint })

    const routeNameInput = page.getByPlaceholder('Route name')
    await expect(routeNameInput).toHaveValue(routeName, { timeout: 10000 })

    const gradeTrigger = routeNameInput.locator('xpath=following-sibling::button[1]')
    await expect(gradeTrigger).toBeVisible({ timeout: 10000 })

    const voteResult = await page.evaluate(async ({ imageId, routeLineId }) => {
      const token = window.localStorage.getItem('csrf_token')
      const response = await fetch(`/api/submissions/${imageId}/grade-votes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': token || '',
        },
        body: JSON.stringify({ grades: [{ routeLineId, grade: '7A' }] }),
      })

      const payload = await response.json().catch(() => null)
      return {
        ok: response.ok,
        status: response.status,
        payload,
      }
    }, { imageId: routeLineRow.image_id, routeLineId: routeLineRow.id })

    expect(voteResult.ok, JSON.stringify(voteResult.payload)).toBeTruthy()

    await expect.poll(async () => {
      const { data, error } = await supabaseAdmin
        .from('grade_votes')
        .select('user_id, grade')
        .eq('climb_id', climbRow.id)

      if (error) {
        throw new Error(error.message)
      }

      const rows = data || []
      const uniqueUserIds = new Set(rows.map((row) => row.user_id))
      const allSelectedGrade = rows.every((row) => row.grade === '7A')
      return { count: uniqueUserIds.size, allSelectedGrade }
    }, { timeout: 15000 }).toEqual({ count: 3, allSelectedGrade: true })
  })
})
