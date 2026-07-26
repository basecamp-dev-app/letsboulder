import { beforeEach, describe, expect, test, vi } from 'vitest'

vi.stubGlobal('self', {
  addEventListener: vi.fn(),
  skipWaiting: vi.fn(async () => undefined),
  registration: { unregister: vi.fn(async () => true) },
})

vi.stubGlobal('BroadcastChannel', class {
  postMessage() {}
  close() {}
})

vi.stubGlobal('Request', class extends Request {
  constructor(input: string | URL | Request, init?: RequestInit) {
    const normalizedInput = typeof input === 'string' && input.startsWith('/')
      ? new URL(input, 'https://letsboulder.com').toString()
      : input
    super(normalizedInput, init)
  }
})

vi.stubGlobal('Response', Response)
vi.stubGlobal('caches', {
  keys: vi.fn(async () => ['offline-shell-v4', 'offline-route-assets-v2', 'runtime-transient-v2', 'unrelated-cache']),
  delete: vi.fn(async () => true),
})

describe('service worker activate', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  test('removes retired caches and unregisters itself', async () => {
    await import('../../public/sw.js')

    const addEventListener = vi.mocked(self.addEventListener)
    const activateHandler = addEventListener.mock.calls.find(([type]) => (type as string) === 'activate')?.[1]

    expect(typeof activateHandler).toBe('function')

    let pending: Promise<unknown> | undefined
    const waitUntil = vi.fn((promise: Promise<unknown>) => {
      pending = promise
    })
    activateHandler?.({ waitUntil } as unknown as ExtendableEvent)
    await pending

    expect(caches.delete).toHaveBeenCalledWith('offline-shell-v4')
    expect(caches.delete).toHaveBeenCalledWith('offline-route-assets-v2')
    expect(caches.delete).toHaveBeenCalledWith('runtime-transient-v2')
    expect(caches.delete).not.toHaveBeenCalledWith('unrelated-cache')
    expect(self.registration.unregister).toHaveBeenCalledTimes(1)
  })
})
