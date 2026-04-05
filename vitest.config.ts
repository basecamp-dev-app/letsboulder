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
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['app/api/**/*.ts'],
      thresholds: {
        perFile: true,
        lines: 0,
        functions: 0,
        branches: 0,
        statements: 0,
        'app/api/offline-packs/climbs/[id]/route.ts': {
          lines: 85,
          functions: 100,
          branches: 50,
          statements: 85,
        },
        'app/api/offline-packs/crags/[id]/route.ts': {
          lines: 70,
          functions: 90,
          branches: 45,
          statements: 70,
        },
        'app/api/media/upload-sessions/route.ts': {
          lines: 75,
          functions: 50,
          branches: 55,
          statements: 75,
        },
        'app/api/media/upload-sessions/[imageId]/route.ts': {
          lines: 70,
          functions: 50,
          branches: 65,
          statements: 70,
        },
        'app/api/media/upload-sessions/[imageId]/complete/route.ts': {
          lines: 65,
          functions: 40,
          branches: 55,
          statements: 65,
        },
        'app/api/places/search/route.ts': {
          lines: 85,
          functions: 100,
          branches: 75,
          statements: 85,
        },
        'app/api/crags/search/route.ts': {
          lines: 55,
          functions: 65,
          branches: 30,
          statements: 55,
        },
        'app/api/images/search/route.ts': {
          lines: 70,
          functions: 65,
          branches: 45,
          statements: 70,
        },
        'app/api/locations/search/route.ts': {
          lines: 80,
          functions: 100,
          branches: 55,
          statements: 80,
        },
      },
    },
  },
})
