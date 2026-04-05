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

interface ProfilePayload {
  username: string | null
  first_name: string | null
  last_name: string | null
  gender: string | null
  height_cm: number | null
  reach_cm: number | null
  avatar_url: string | null
  bio: string | null
  boulder_system: string | null
  route_system: string | null
  trad_system: string | null
  units: string | null
  is_public: boolean | null
  default_location: string | null
  default_location_name: string | null
  default_location_lat: number | null
  default_location_lng: number | null
  default_location_zoom: number | null
  theme_preference: string | null
  contribution_credit_platform: string | null
  contribution_credit_handle: string | null
}

function mapProfileToSettings(profile: ProfilePayload): SettingsPayload {
  return {
    settings: {
      username: profile.username || '',
      firstName: profile.first_name || '',
      lastName: profile.last_name || '',
      gender: profile.gender || 'prefer_not_to_say',
      heightCm: profile.height_cm,
      reachCm: profile.reach_cm,
      avatarUrl: profile.avatar_url || '',
      bio: profile.bio || '',
      boulderSystem: profile.boulder_system || 'v_scale',
      routeSystem: profile.route_system || 'yds_equivalent',
      tradSystem: profile.trad_system || 'yds_equivalent',
      units: profile.units || 'metric',
      isPublic: profile.is_public !== false,
      defaultLocation: profile.default_location || '',
      defaultLocationName: profile.default_location_name || '',
      defaultLocationLat: profile.default_location_lat,
      defaultLocationLng: profile.default_location_lng,
      defaultLocationZoom: profile.default_location_zoom,
      themePreference: profile.theme_preference || 'system',
      contributionCreditPlatform: profile.contribution_credit_platform || '',
      contributionCreditHandle: profile.contribution_credit_handle || '',
    },
    imageCount: 0,
  }
}

export async function fetchSettings(): Promise<SettingsPayload> {
  const response = await fetch('/api/profile', {
    credentials: 'include',
  })

  if (!response.ok) {
    const payload = await response.json().catch(() => ({} as { error?: string }))
    throw new Error(payload.error || 'Failed to load settings')
  }

  const profile = await response.json() as ProfilePayload
  return mapProfileToSettings(profile)
}
