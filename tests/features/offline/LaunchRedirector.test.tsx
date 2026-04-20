import { render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import LaunchRedirector from '@/features/offline/components/LaunchRedirector'

const mockReplace = vi.fn()
const mockUsePathname = vi.fn()
const mockUseSearchParams = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace }),
  usePathname: () => mockUsePathname(),
  useSearchParams: () => mockUseSearchParams(),
}))

vi.mock('@/components/map/MapLoadingShell', () => ({
  default: () => <div>loading shell</div>,
}))

describe('LaunchRedirector', () => {
  beforeEach(() => {
    mockReplace.mockReset()
    mockUseSearchParams.mockReset()
    mockUsePathname.mockReset()
    window.localStorage.clear()
    Object.defineProperty(window.navigator, 'onLine', {
      configurable: true,
      value: true,
    })
  })

  it('restores a recent stored logbook route from /launch', async () => {
    window.localStorage.setItem('lb:last-route', JSON.stringify({
      href: '/logbook',
      savedAt: Date.now(),
      kind: 'logbook',
    }))
    mockUsePathname.mockReturnValue('/launch')
    mockUseSearchParams.mockReturnValue(new URLSearchParams())

    render(<LaunchRedirector />)

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/logbook')
    })
  })

  it('falls back to offline library for generic offline launch', async () => {
    Object.defineProperty(window.navigator, 'onLine', {
      configurable: true,
      value: false,
    })
    mockUsePathname.mockReturnValue('/launch')
    mockUseSearchParams.mockReturnValue(new URLSearchParams())

    render(<LaunchRedirector />)

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/offline/library?reason=offline')
    })
  })

  it('preserves exact incoming deep links', async () => {
    mockUsePathname.mockReturnValue('/gb/font/i/image-1')
    mockUseSearchParams.mockReturnValue(new URLSearchParams('route=test&climb=abc'))

    render(<LaunchRedirector />)

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/gb/font/i/image-1?route=test&climb=abc')
    })
  })
})
