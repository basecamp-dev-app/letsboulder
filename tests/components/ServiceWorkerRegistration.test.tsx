import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ServiceWorkerRegistration from '@/components/ServiceWorkerRegistration'

let pathname = '/'

vi.mock('next/navigation', () => ({
  usePathname: () => pathname,
}))

function createServiceWorkerMock() {
  const listeners = new Map<string, Set<EventListenerOrEventListenerObject>>()
  const waiting = { postMessage: vi.fn() }
  const registration = {
    waiting,
    installing: null,
    update: vi.fn(async () => undefined),
    addEventListener: vi.fn((type: string, listener: EventListenerOrEventListenerObject) => {
      const existing = listeners.get(type) || new Set<EventListenerOrEventListenerObject>()
      existing.add(listener)
      listeners.set(type, existing)
    }),
  }
  const serviceWorker = {
    register: vi.fn(async () => registration),
    addEventListener: vi.fn((type: string, listener: EventListenerOrEventListenerObject) => {
      const existing = listeners.get(type) || new Set<EventListenerOrEventListenerObject>()
      existing.add(listener)
      listeners.set(type, existing)
    }),
    dispatch(type: string) {
      listeners.get(type)?.forEach((listener) => {
        if (typeof listener === 'function') {
          listener(new Event(type))
          return
        }
        listener.handleEvent(new Event(type))
      })
    },
  }

  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: serviceWorker,
  })

  return { registration, serviceWorker, waiting }
}

describe('ServiceWorkerRegistration', () => {
  beforeEach(() => {
    pathname = '/'
    window.__letsboulderHasActiveUploads = false
    Object.defineProperty(window, 'isSecureContext', {
      configurable: true,
      value: true,
    })
  })

  it('prompts instead of activating a waiting service worker immediately', async () => {
    const { waiting } = createServiceWorkerMock()

    render(<ServiceWorkerRegistration />)

    expect(await screen.findByText('Update available')).toBeInTheDocument()
    expect(waiting.postMessage).not.toHaveBeenCalled()
  })

  it('activates and reloads after an explicit update tap', async () => {
    const { waiting } = createServiceWorkerMock()

    render(<ServiceWorkerRegistration />)
    await userEvent.click(await screen.findByRole('button', { name: 'Update now' }))

    expect(waiting.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' })
  })

  it('defers activation while uploads are active', async () => {
    const { waiting } = createServiceWorkerMock()

    render(<ServiceWorkerRegistration />)
    await screen.findByText('Update available')
    window.dispatchEvent(new CustomEvent('letsboulder:upload-activity', { detail: { active: true } }))
    await userEvent.click(await screen.findByRole('button', { name: 'Update now' }))

    expect(await screen.findByText('The update will wait until uploads or active forms are clear.')).toBeInTheDocument()
    expect(waiting.postMessage).not.toHaveBeenCalled()
  })

  it('applies a deferred update on the next navigation when safe', async () => {
    const { waiting } = createServiceWorkerMock()
    const { rerender } = render(<ServiceWorkerRegistration />)

    await userEvent.click(await screen.findByRole('button', { name: 'Later' }))
    pathname = '/next'
    rerender(<ServiceWorkerRegistration />)

    await waitFor(() => {
      expect(waiting.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' })
    })
  })
})
