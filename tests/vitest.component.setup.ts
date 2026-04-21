import '@testing-library/jest-dom/vitest'
import React from 'react'
import { afterEach, beforeAll, beforeEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'

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
