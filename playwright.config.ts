import { defineConfig, devices } from '@playwright/test'
import path from 'path'
import dotenv from 'dotenv'

dotenv.config({ path: path.resolve(__dirname, 'tests/.env.test') })

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.ts',
  testIgnore: process.env.CI ? ['**/canvas.spec.ts'] : undefined,
  globalSetup: process.env.TEST_API_KEY && process.env.TEST_USER_ID && process.env.TEST_USER_PASSWORD
    ? path.resolve(__dirname, 'global-setup.ts')
    : undefined,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: process.env.CI ? 3 : undefined,
  reporter: 'html',
  use: {
    baseURL: process.env.CI ? 'https://dev.letsboulder.com' : 'http://localhost:3000',
    trace: 'on-first-retry',
    headless: true,
    ...(process.env.CF_ACCESS_CLIENT_ID && process.env.CF_ACCESS_CLIENT_SECRET ? {
      extraHTTPHeaders: {
        'CF-Access-Client-Id': process.env.CF_ACCESS_CLIENT_ID!,
        'CF-Access-Client-Secret': process.env.CF_ACCESS_CLIENT_SECRET!,
      },
    } : {}),
  },
  projects: [
    {
      name: 'public',
      testIgnore: /.*\.auth\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'authenticated',
      testMatch: /.*\.auth\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        storageState: path.resolve(__dirname, 'playwright/.auth/user.json'),
      },
    },
  ],
  webServer: process.env.CI ? undefined : {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
    env: {
      ...process.env,
      TEST_API_KEY: process.env.TEST_API_KEY || '',
      TEST_USER_PASSWORD: process.env.TEST_USER_PASSWORD || '',
      ENABLE_TEST_AUTH_ENDPOINT: 'true',
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
      DEV_SUPABASE_SERVICE_ROLE_KEY: process.env.DEV_SUPABASE_SERVICE_ROLE_KEY || '',
    },
  },
})
