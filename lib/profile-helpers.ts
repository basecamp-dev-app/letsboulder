export interface ProfileRow {
  id: string
  username: string | null
  display_name: string | null
  first_name: string | null
  last_name: string | null
  avatar_url: string | null
  is_public: boolean
}

export function getDisplayName(profile: ProfileRow): string {
  const fullName = `${profile.first_name || ''} ${profile.last_name || ''}`.trim()
  if (fullName) return fullName
  if (profile.display_name) return profile.display_name
  if (profile.username) return profile.username
  return `Climber ${profile.id.slice(0, 4)}`
}

export function getClimbRecord<T extends { id: string }>(climbs: T | T[] | null | undefined): T | null {
  if (Array.isArray(climbs)) return climbs[0] || null
  return climbs || null
}
