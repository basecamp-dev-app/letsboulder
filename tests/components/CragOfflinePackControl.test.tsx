import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import CragOfflinePackControl from '@/features/offline/components/CragOfflinePackControl'

const useOfflinePacks = vi.fn()

vi.mock('@/features/offline/hooks/use-connectivity', () => ({ useConnectivity: () => ({ status: 'online', check: vi.fn() }) }))
vi.mock('@/features/offline/hooks/use-offline-packs', () => ({ useOfflinePacks: () => useOfflinePacks() }))

describe('crag offline pack control', () => {
  it('does not present an uninstalled crag as an available offline guide', () => {
    useOfflinePacks.mockReturnValue({
      packs: [], loading: false, error: null, install: vi.fn(), repair: vi.fn(), remove: vi.fn(), discardFailed: vi.fn(),
    })

    render(<CragOfflinePackControl cragId="123e4567-e89b-42d3-a456-426614174000" />)

    expect(screen.getByRole('button', { name: 'Download offline' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Offline guide' })).not.toBeInTheDocument()
  })
})
