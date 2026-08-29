import path from 'node:path'
import { defineConfig } from '@playwright/test'

import baseConfig from './playwright.config'

const releaseProfile = process.env.RUNTIME_AUDIT_PROFILE === 'release'

export default defineConfig({
  ...baseConfig,
  outputDir: process.env.PLAYWRIGHT_OUTPUT_DIR || path.resolve(__dirname, 'runtime-audit-work/test-results'),
  reporter: releaseProfile
    ? [
        ['html', { outputFolder: process.env.PLAYWRIGHT_HTML_REPORT || 'playwright-report-runtime-audit-release' }],
        [path.resolve(__dirname, 'tests/reporters/runtime-audit-reporter.ts')],
      ]
    : [
        ['line'],
        [path.resolve(__dirname, 'tests/reporters/runtime-audit-reporter.ts')],
      ],
  use: {
    ...(baseConfig.use || {}),
    trace: releaseProfile ? 'on' : 'retain-on-failure',
    screenshot: 'off',
    video: releaseProfile ? 'on' : 'retain-on-failure',
  },
})
