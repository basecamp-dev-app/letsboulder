import fs from 'fs'
import path from 'path'
import { test, expect, type Page } from '@playwright/test'
import globalSetup from '../global-setup'

const AUTH_STATE_PATH = path.resolve(process.cwd(), 'playwright/.auth/user.json')
const IMAGE_FIXTURES = [
  path.join(__dirname, 'fixtures/IMG-20260223-WA0006~2.jpg'),
  path.join(__dirname, 'fixtures/gg.png'),
]

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

async function createDraftFromIntake(page: Page) {
  await page.goto('/submit')
  await expect(page).not.toHaveURL(/\/auth/)
  await expect(page.getByRole('heading', { name: 'Start a new draft' })).toBeVisible()

  await page.locator('input[type="file"]').setInputFiles(IMAGE_FIXTURES)
  await expect(page.getByText(/Compressing/i)).not.toBeVisible({ timeout: 20000 })
  await page.getByRole('button', { name: /^Upload\s+\d+\s+Photo/i }).click()

  await expect(page.getByText(/photo(s)? selected/i)).toBeVisible({ timeout: 20000 })
  await page.getByRole('button', { name: 'Create draft and continue' }).click()

  await expect(page).toHaveURL(/\/logbook\/drafts\/[0-9a-f-]+\/edit/i, { timeout: 30000 })
}

test.describe.serial('Route Submission Draft Intake', () => {
  test.beforeAll(async () => {
    await ensureAuthStateExists()
  })

  test('authenticated user can create draft and land in draft editor', async ({ page }) => {
    await createDraftFromIntake(page)

    await expect(page.getByText('Draft', { exact: true })).toBeVisible({ timeout: 20000 })
    await expect(page.getByRole('button', { name: 'Save draft' })).toBeVisible({ timeout: 20000 })
  })

  test('draft editor save works without localStorage wizard state', async ({ page }) => {
    await createDraftFromIntake(page)

    await page.getByRole('button', { name: 'Save draft' }).click()
    await expect(page).toHaveURL(/\/logbook\/drafts\/[0-9a-f-]+\/edit/i)

    const draftUrl = page.url()
    await page.reload()
    await expect(page).toHaveURL(draftUrl)
    await expect(page.getByRole('button', { name: 'Save draft' })).toBeVisible({ timeout: 20000 })
  })
})
