import '@testing-library/jest-dom/vitest'
import React from 'react'
import { afterEach, beforeAll, beforeEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'

vi.mock('server-only', () => ({}))

// Mock server env vars required by lib/env.server.ts
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'service-role-test-key-that-is-at-least-32-chars-long'
process.env.CSRF_SECRET = process.env.CSRF_SECRET || 'csrf-secret-test-key-that-is-at-least-32-chars'
process.env.DELETE_ACCOUNT_SECRET = process.env.DELETE_ACCOUNT_SECRET || 'delete-account-secret-test-key-32chars'
process.env.R2_S3_ENDPOINT = process.env.R2_S3_ENDPOINT || 'https://test.r2.cloudflarestorage.com'
process.env.R2_PRIVATE_BUCKET = process.env.R2_PRIVATE_BUCKET || 'test-private'
process.env.R2_PUBLIC_BUCKET = process.env.R2_PUBLIC_BUCKET || 'test-public'
process.env.R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || 'test-access-key'
process.env.R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || 'test-secret-key'

vi.mock('next/image', () => ({
  default: ({ alt, src, ...props }: React.ImgHTMLAttributes<HTMLImageElement> & { fill?: boolean; unoptimized?: boolean }) => {
    return React.createElement('img', { alt, src, ...props })
  },
}))

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})

class ResizeObserverMock {
  observe = vi.fn()
  unobserve = vi.fn()
  disconnect = vi.fn()
}

class IntersectionObserverMock {
  observe = vi.fn()
  unobserve = vi.fn()
  disconnect = vi.fn()
  root = null
  rootMargin = ''
  thresholds = []
  takeRecords() {
    return []
  }
}

class PointerEventMock extends MouseEvent {}

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverMock)
  vi.stubGlobal('IntersectionObserver', IntersectionObserverMock)
  vi.stubGlobal('PointerEvent', PointerEventMock)
})

beforeEach(() => {
  vi.clearAllMocks()

  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })))

  URL.createObjectURL = vi.fn(() => 'blob:preview-url')
  URL.revokeObjectURL = vi.fn()

  Object.defineProperty(window, 'devicePixelRatio', {
    configurable: true,
    value: 1,
  })

  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    configurable: true,
    value: vi.fn(() => ({
      clearRect: vi.fn(),
      save: vi.fn(),
      scale: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
      closePath: vi.fn(),
    })),
  })

  Object.defineProperty(HTMLCanvasElement.prototype, 'getBoundingClientRect', {
    configurable: true,
    value: vi.fn(() => ({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      bottom: 400,
      right: 300,
      width: 300,
      height: 400,
      toJSON: () => ({}),
    })),
  })
})

afterEach(() => {
  cleanup()
})
