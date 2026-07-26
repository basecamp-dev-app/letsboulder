import { render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import OfflineRetirementCleanup from '@/components/OfflineRetirementCleanup'
import { clearRegisteredServiceWorkers } from '@/lib/offline/service-worker-client'
import { clearStoredOfflinePackRecords } from '@/lib/offline/storage'

vi.mock('@/lib/offline/service-worker-client', () => ({
  clearRegisteredServiceWorkers: vi.fn(),
}))

vi.mock('@/lib/offline/storage', () => ({
  clearStoredOfflinePackRecords: vi.fn(),
}))

describe('OfflineRetirementCleanup', () => {
  beforeEach(() => {
    vi.mocked(clearRegisteredServiceWorkers).mockReset().mockResolvedValue(undefined)
    vi.mocked(clearStoredOfflinePackRecords).mockReset().mockResolvedValue(undefined)
  })

  it('cleans service-worker and pack storage on app load', async () => {
    render(<OfflineRetirementCleanup />)

    await waitFor(() => {
      expect(clearRegisteredServiceWorkers).toHaveBeenCalledTimes(1)
    })
    expect(clearStoredOfflinePackRecords).toHaveBeenCalledTimes(1)
  })

  it('does not surface cleanup failures to the app', async () => {
    vi.mocked(clearRegisteredServiceWorkers).mockRejectedValueOnce(new Error('cleanup failed'))

    render(<OfflineRetirementCleanup />)

    await waitFor(() => {
      expect(clearRegisteredServiceWorkers).toHaveBeenCalledTimes(1)
    })
  })
})
