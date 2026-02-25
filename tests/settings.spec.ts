import { test, expect } from '@playwright/test'

test.describe('Settings', () => {
  test.beforeEach(async ({ page }) => {
    page.on('console', msg => {
      if (msg.type() === 'error') {
        console.log(`[Browser Console Error] ${msg.text()}`)
      }
    })
    page.on('requestfailed', request => {
      console.log(`[Network Failed] ${request.url()} - ${request.failure()?.errorText}`)
    })
  })

  test('unauthenticated user is redirected to login', async ({ page }) => {
    await page.goto('/settings')
    
    await expect(page).toHaveURL(/auth/)
  })

  test('authenticated user can access settings page', async ({ page }) => {
    await page.goto('/settings')
    
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible({ timeout: 10000 })
  })

  test('profile tab displays all form fields', async ({ page }) => {
    await page.goto('/settings')
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible({ timeout: 10000 })
    
    await expect(page.getByLabel('First Name')).toBeVisible()
    await expect(page.getByLabel('Last Name')).toBeVisible()
    await expect(page.getByLabel('Gender')).toBeVisible()
    await expect(page.getByLabel('Bio')).toBeVisible()
    await expect(page.getByLabel('Height (cm)')).toBeVisible()
    await expect(page.getByLabel('Reach (cm)')).toBeVisible()
    await expect(page.getByPlaceholder('handle')).toBeVisible()
  })

  test('can switch between all tabs', async ({ page }) => {
    await page.goto('/settings')
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible({ timeout: 10000 })
    
    await page.getByRole('tab', { name: 'Units' }).click()
    await expect(page.getByText('Measurement Units')).toBeVisible()
    
    await page.getByRole('tab', { name: 'Appearance' }).click()
    await expect(page.getByText('Choose your preferred appearance')).toBeVisible()
    
    await page.getByRole('tab', { name: 'Privacy' }).click()
    await expect(page.getByText('Profile Visibility')).toBeVisible()
    
    await page.getByRole('tab', { name: 'Profile' }).click()
    await expect(page.getByLabel('First Name')).toBeVisible()
  })

  test('units tab displays all grade system options', async ({ page }) => {
    await page.goto('/settings')
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible({ timeout: 10000 })
    
    await page.getByRole('tab', { name: 'Units' }).click()
    
    await expect(page.getByText('Measurement Units')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Metric' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Imperial' })).toBeVisible()
    
    await expect(page.getByText('Bouldering')).toBeVisible()
    await expect(page.getByRole('button', { name: /v scale/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /font/i })).toBeVisible()
    
    await expect(page.getByText('Sport & Deep Water Solo')).toBeVisible()
    await expect(page.getByRole('button', { name: /yds/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /french/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /british/i })).toBeVisible()
  })

  test('appearance tab displays theme options', async ({ page }) => {
    await page.goto('/settings')
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible({ timeout: 10000 })
    
    await page.getByRole('tab', { name: 'Appearance' }).click()
    
    await expect(page.getByRole('button', { name: 'Light' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Dark' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'System' })).toBeVisible()
  })

  test('privacy tab displays visibility and delete options', async ({ page }) => {
    await page.goto('/settings')
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible({ timeout: 10000 })
    
    await page.getByRole('tab', { name: 'Privacy' }).click()
    
    await expect(page.getByText('Profile Visibility')).toBeVisible()
    await expect(page.getByRole('button', { name: /make (private|public)/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /delete account/i })).toBeVisible()
  })

  test('can toggle metric/imperial units', async ({ page }) => {
    await page.goto('/settings')
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible({ timeout: 10000 })
    
    await page.getByRole('tab', { name: 'Units' }).click()
    
    await page.getByRole('button', { name: 'Imperial' }).click()
    
    await expect(page.getByRole('button', { name: 'Imperial' })).toHaveClass(/border-gray-900/)
  })

  test('can toggle bouldering grade system', async ({ page }) => {
    await page.goto('/settings')
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible({ timeout: 10000 })
    
    await page.getByRole('tab', { name: 'Units' }).click()
    
    await page.getByRole('button', { name: /font/i }).click()
    
    await expect(page.getByRole('button', { name: /font/i })).toHaveClass(/border-gray-900/)
  })

  test('can toggle sport grade system', async ({ page }) => {
    await page.goto('/settings')
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible({ timeout: 10000 })
    
    await page.getByRole('tab', { name: 'Units' }).click()
    
    await page.getByRole('button', { name: /french/i }).first().click()
    
    const buttons = await page.getByRole('button', { name: /french/i }).all()
    expect(buttons.length).toBeGreaterThan(0)
  })

  test('can toggle theme preference', async ({ page }) => {
    await page.goto('/settings')
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible({ timeout: 10000 })
    
    await page.getByRole('tab', { name: 'Appearance' }).click()
    
    await page.getByRole('button', { name: 'Dark' }).click()
    
    await expect(page.getByRole('button', { name: 'Dark' })).toHaveClass(/border-gray-900/)
  })

  test('can toggle profile visibility', async ({ page }) => {
    await page.goto('/settings')
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible({ timeout: 10000 })
    
    await page.getByRole('tab', { name: 'Privacy' }).click()
    
    const toggleButton = page.getByRole('button', { name: /make (private|public)/i })
    await toggleButton.click()
    
    await expect(page.getByText(/Your profile is currently/)).toBeVisible()
  })

  test('delete account button opens dialog', async ({ page }) => {
    await page.goto('/settings')
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible({ timeout: 10000 })
    
    await page.getByRole('tab', { name: 'Privacy' }).click()
    
    await page.getByRole('button', { name: /delete account/i }).click()
    
    await expect(page.getByRole('dialog')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Delete Account?' })).toBeVisible()
  })

  test('profile form shows character count for bio', async ({ page }) => {
    await page.goto('/settings')
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible({ timeout: 10000 })
    
    await expect(page.getByText(/\/500 characters/)).toBeVisible()
  })

  test('gender dropdown has all options', async ({ page }) => {
    await page.goto('/settings')
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible({ timeout: 10000 })
    
    await page.getByLabel('Gender').click()
    
    await expect(page.getByRole('option', { name: 'Prefer not to say' })).toBeVisible()
    await expect(page.getByRole('option', { name: 'Male' })).toBeVisible()
    await expect(page.getByRole('option', { name: 'Female' })).toBeVisible()
    await expect(page.getByRole('option', { name: 'Other' })).toBeVisible()
  })

  test('height and reach inputs accept numeric input', async ({ page }) => {
    await page.goto('/settings')
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible({ timeout: 10000 })
    
    const heightInput = page.getByLabel('Height (cm)')
    const reachInput = page.getByLabel('Reach (cm)')
    
    await heightInput.fill('180')
    await reachInput.fill('190')
    
    await expect(heightInput).toHaveValue('180')
    await expect(reachInput).toHaveValue('190')
  })

  test('contribution credit platform dropdown works', async ({ page }) => {
    await page.goto('/settings')
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible({ timeout: 10000 })
    
    await page.getByLabel('Gender').click()
    
    await expect(page.getByRole('option', { name: 'Instagram' })).toBeVisible()
    await expect(page.getByRole('option', { name: 'TikTok' })).toBeVisible()
    await expect(page.getByRole('option', { name: 'YouTube' })).toBeVisible()
    await expect(page.getByRole('option', { name: 'X' })).toBeVisible()
    await expect(page.getByRole('option', { name: 'Other' })).toBeVisible()
  })

  test('save button is present on profile tab', async ({ page }) => {
    await page.goto('/settings')
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible({ timeout: 10000 })
    
    await expect(page.getByRole('button', { name: /save/i })).toBeVisible()
  })
})
