export interface GymListItem {
  id: string
  name: string
  slug: string | null
  country_code: string | null
  active_route_count: number
  membership_role: string | null
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
  discipline: 'boulder' | 'sport' | 'top_rope' | 'mixed'
  color: string
  setter_name: string
  status: 'active' | 'retired'
  marker: { x_norm: number; y_norm: number } | null
}

export interface GymConfigPayload {
  floor_plan: FloorPlan | null
  routes: Array<{
    id: string
    floor_plan_id: string
    name: string | null
    grade: string
    discipline: 'boulder' | 'sport' | 'top_rope' | 'mixed'
    color: string | null
    setter_name: string | null
    status: 'active' | 'retired'
    marker: { x_norm: number; y_norm: number } | null
  }>
}

export const DISCIPLINE_OPTIONS = [
  { value: 'boulder' as const, label: 'Bouldering' },
  { value: 'sport' as const, label: 'Sport' },
  { value: 'top_rope' as const, label: 'Top rope' },
  { value: 'mixed' as const, label: 'Mixed' },
]
