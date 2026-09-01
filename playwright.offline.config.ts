import { defineConfig, devices } from '@playwright/test'

const baseURL = 'http://127.0.0.1:3000'

export default defineConfig({
  testDir: './tests',
  testMatch: 'offline.spec.ts',
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL,
    headless: true,
    serviceWorkers: 'allow',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'offline-chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run build && npm run start -- --hostname 127.0.0.1',
    url: `${baseURL}/offline/fixture`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'offline-fixture-anon-key',
      SUPABASE_SERVICE_ROLE_KEY: 'offline-fixture-service-role-key-000000000000',
      CSRF_SECRET: 'offline-fixture-csrf-secret-00000000000000000000',
      DELETE_ACCOUNT_SECRET: 'offline-fixture-delete-secret-00000000000000',
      R2_S3_ENDPOINT: 'https://offline-fixture.invalid',
      R2_PRIVATE_BUCKET: 'offline-fixture-private',
      R2_PUBLIC_BUCKET: 'offline-fixture-public',
      R2_ACCESS_KEY_ID: 'offline-fixture-access-key',
      R2_SECRET_ACCESS_KEY: 'offline-fixture-secret-key',
    },
  },
})
