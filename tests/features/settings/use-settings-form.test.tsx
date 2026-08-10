import type { ReactNode } from 'react'
import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useSettingsForm } from '@/features/settings/hooks/use-settings-form'
import type { SettingsPayload } from '@/features/settings/lib/queries'
import { updateGradePreferences } from '@/lib/grades/preferences'

const mocks = vi.hoisted(() => ({
  saveSettingsAction: vi.fn(),
  updateGradePreferences: vi.fn(),
}))

vi.mock('@/features/settings/actions/save-settings', () => ({ saveSettingsAction: mocks.saveSettingsAction }))
vi.mock('@/lib/grades/preferences', () => ({ updateGradePreferences: mocks.updateGradePreferences }))

const settings: SettingsPayload = {
  settings: {
    username: 'climber', firstName: '', lastName: '', gender: 'prefer_not_to_say', heightCm: null, reachCm: null,
    avatarUrl: '', bio: '', boulderSystem: 'v_scale', routeSystem: 'yds_equivalent', tradSystem: 'yds_equivalent',
    units: 'metric', isPublic: true, defaultLocation: '', defaultLocationName: '', defaultLocationLat: null,
    defaultLocationLng: null, defaultLocationZoom: null, themePreference: 'system', contributionCreditPlatform: '', contributionCreditHandle: '',
  },
  imageCount: 0,
}

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
}

describe('useSettingsForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('does not publish edited grade preferences when saving fails', async () => {
    mocks.saveSettingsAction.mockResolvedValue({ success: false, error: 'Failed to save' })
    const { result } = renderHook(() => useSettingsForm({ data: settings, isLoading: false, error: null }), { wrapper: createWrapper() })

    await waitFor(() => expect(result.current.loading).toBe(false))
    vi.mocked(updateGradePreferences).mockClear()

    act(() => result.current.handleBoulderSystemChange('font_scale'))
    expect(updateGradePreferences).not.toHaveBeenCalled()

    await act(async () => { await result.current.handleSave() })
    expect(updateGradePreferences).not.toHaveBeenCalled()
  })

  it('publishes edited grade preferences only after saving succeeds', async () => {
    mocks.saveSettingsAction.mockResolvedValue({ success: true, data: {} })
    const { result } = renderHook(() => useSettingsForm({ data: settings, isLoading: false, error: null }), { wrapper: createWrapper() })

    await waitFor(() => expect(result.current.loading).toBe(false))
    vi.mocked(updateGradePreferences).mockClear()

    act(() => {
      result.current.handleBoulderSystemChange('font_scale')
      result.current.handleRouteSystemChange('french_equivalent')
      result.current.handleTradSystemChange('british_equivalent')
    })
    expect(updateGradePreferences).not.toHaveBeenCalled()

    await act(async () => { await result.current.handleSave() })
    expect(updateGradePreferences).toHaveBeenCalledWith({
      boulder: 'font_scale',
      route: 'french_equivalent',
      trad: 'british_equivalent',
    })
  })
})
