export type GymDiscipline = 'boulder' | 'sport' | 'top_rope' | 'mixed'

export interface GymListItem {
  id: string
  name: string
  slug: string | null
  country_code: string | null
  latitude: number | null
  longitude: number | null
  primary_discipline: string | null
  disciplines: string[]
  active_route_count: number
  active_floor_plan: {
    id: string
    name: string
    image_url: string
  } | null
}

export interface FloorPlan {
  id: string
  gym_place_id: string
  name: string
  image_url: string
  image_width: number
  image_height: number
  is_active: boolean
}

export interface EditableRoute {
  id: string
  persistedId: string | null
  floor_plan_id: string
  name: string
  grade: string
  discipline: GymDiscipline
  color: string
  setter_name: string
  status: 'active' | 'retired'
  marker: { x_norm: number; y_norm: number } | null
}

export const DISCIPLINE_OPTIONS = [
  { value: 'boulder', label: 'Bouldering' },
  { value: 'sport', label: 'Sport' },
  { value: 'top_rope', label: 'Top rope' },
  { value: 'mixed', label: 'Mixed' },
] as const

export function formatDiscipline(value: string): string {
  return value.replace(/_/g, ' ')
}
