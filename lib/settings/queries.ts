export interface SettingsPayload {
  settings: {
    username: string
    firstName: string
    lastName: string
    gender: string
    heightCm: number | null
    reachCm: number | null
    avatarUrl: string
    bio: string
    boulderSystem: string
    routeSystem: string
    tradSystem: string
    units: string
    isPublic: boolean
    defaultLocation: string
    defaultLocationName: string
    defaultLocationLat: number | null
    defaultLocationLng: number | null
    defaultLocationZoom: number | null
    themePreference: string
    contributionCreditPlatform: string
    contributionCreditHandle: string
  }
  imageCount: number
}

export const settingsQueryKey = ['settings', 'me'] as const

export async function fetchSettings(): Promise<SettingsPayload> {
  const response = await fetch('/api/settings', {
    credentials: 'include',
  })

  if (!response.ok) {
    const payload = await response.json().catch(() => ({} as { error?: string }))
    throw new Error(payload.error || 'Failed to load settings')
  }

  return response.json() as Promise<SettingsPayload>
}
