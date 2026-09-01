import { defineConfig, devices } from '@playwright/test'
import path from 'path'
import dotenv from 'dotenv'
import { validateAuthenticatedBaseUrl, validateTrustedBaseUrl } from '@/scripts/playwright/deployment-url'

dotenv.config({ path: path.resolve(__dirname, 'tests/.env.test') })

const configuredBaseUrl = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000'
const resolvedBaseUrl = process.env.CI
  ? validateTrustedBaseUrl(configuredBaseUrl, Boolean(process.env.VERCEL_DEPLOYMENT_ID?.trim()))
  : configuredBaseUrl
if (process.env.CI && process.env.PLAYWRIGHT_AUTHENTICATED_SMOKE === 'true') {
  validateAuthenticatedBaseUrl(resolvedBaseUrl)
}
const skipGlobalSetup = process.env.PLAYWRIGHT_SKIP_GLOBAL_SETUP === 'true'
const offlineReliabilityTest = /offline\.spec\.ts/

if (process.env.CI && !process.env.PLAYWRIGHT_BASE_URL?.trim()) {
  throw new Error('CI requires PLAYWRIGHT_BASE_URL so smoke tests target the resolved environment')
}

console.log(`[playwright] baseURL=${resolvedBaseUrl}`)

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.ts',
  grep: process.env.PW_GREP ? new RegExp(process.env.PW_GREP) : undefined,
  grepInvert: process.env.PW_GREP_INVERT ? new RegExp(process.env.PW_GREP_INVERT) : undefined,
  globalSetup: !skipGlobalSetup && process.env.TEST_API_KEY && (process.env.TEST_USER_EMAIL || process.env.TEST_USER_ID) && process.env.TEST_USER_PASSWORD
    ? path.resolve(__dirname, 'global-setup.ts')
    : undefined,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: process.env.CI ? 3 : undefined,
  reporter: 'html',
  use: {
    baseURL: resolvedBaseUrl,
    trace: process.env.CI ? 'retain-on-failure' : 'on-first-retry',
    headless: true,
  },
  projects: [
    {
      name: 'public',
      testIgnore: [/.*\.auth\.spec\.ts/, offlineReliabilityTest],
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'authenticated',
      testMatch: /.*\.auth\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        storageState: path.resolve(__dirname, 'playwright/.auth/user.json'),
        trace: 'off',
        ...(process.env.CF_ACCESS_CLIENT_ID || process.env.CF_ACCESS_CLIENT_SECRET || process.env.INTERNAL_TEST_KEY ? {
          extraHTTPHeaders: {
            ...(process.env.CF_ACCESS_CLIENT_ID ? { 'CF-Access-Client-Id': process.env.CF_ACCESS_CLIENT_ID } : {}),
            ...(process.env.CF_ACCESS_CLIENT_SECRET ? { 'CF-Access-Client-Secret': process.env.CF_ACCESS_CLIENT_SECRET } : {}),
            ...(process.env.INTERNAL_TEST_KEY ? {
              'x-e2e-test-key': process.env.INTERNAL_TEST_KEY,
              'x-internal-test-key': process.env.INTERNAL_TEST_KEY,
            } : {}),
          },
        } : {}),
      },
    },
    {
      name: 'mobile-safari',
      testIgnore: [/.*\.auth\.spec\.ts/, offlineReliabilityTest],
      use: {
        ...devices['iPhone 12'],
      },
    },
    {
      name: 'mobile-chrome',
      testIgnore: [/.*\.auth\.spec\.ts/, offlineReliabilityTest],
      use: {
        ...devices['Pixel 7'],
      },
    },
  ],
  webServer: process.env.CI ? undefined : {
    command: 'npm run dev',
    url: resolvedBaseUrl,
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
    env: {
      ...process.env,
      TEST_API_KEY: process.env.TEST_API_KEY || '',
      TEST_USER_PASSWORD: process.env.TEST_USER_PASSWORD || '',
      INTERNAL_TEST_KEY: process.env.INTERNAL_TEST_KEY || '',
      TEST_AUTH_PATH_SEGMENT: process.env.TEST_AUTH_PATH_SEGMENT || '',
      ENABLE_TEST_AUTH_ENDPOINT: 'true',
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
      DEV_SUPABASE_SERVICE_ROLE_KEY: process.env.DEV_SUPABASE_SERVICE_ROLE_KEY || '',
    },
  },
})
