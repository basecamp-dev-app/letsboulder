import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

const alias = {
  '@': fileURLToPath(new URL('./', import.meta.url)),
}

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias,
  },
  test: {
    environment: 'node',
    setupFiles: ['./tests/vitest.setup.ts'],
    include: ['tests/**/*.test.ts'],
  },
})

export const componentTestConfig = defineConfig({
  plugins: [react()],
  resolve: {
    alias,
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/vitest.component.setup.ts'],
    include: ['tests/**/*.test.tsx'],
  },
})
