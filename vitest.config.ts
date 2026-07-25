import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    setupFiles: ['./tests/vitest.setup.ts'],
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/database/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['app/api/**/*.ts'],
      exclude: [
        'app/api/test/**/*',
      ],
      thresholds: {
        perFile: false,
        lines: 0,
        functions: 0,
        branches: 0,
        statements: 0,
      },
    },
  },
})
