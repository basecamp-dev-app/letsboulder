export interface RoutePoint {
  x: number
  y: number
}

export interface RouteClimbInfo {
  id: string
  name: string | null
  grade: string
  status: string
  route_type?: string | null
  description?: string | null
}

export interface RouteLine {
  id: string
  image_id: string
  climb_id: string
  points: RoutePoint[]
  color: string
  sequence_order: number
  created_at: string
  image_width?: number
  image_height?: number
  climb?: RouteClimbInfo
}

export interface CanvasDimensions {
  width: number
  height: number
  naturalWidth: number
  naturalHeight: number
}

export interface ZoomTransform {
  x: number
  y: number
  scale: number
}

export type CanvasMode = 'browse' | 'edit-existing' | 'submit'

export type InteractionTool = 'select' | 'draw' | 'pan'

export interface DrawingRoute {
  id: string
  name: string
  grade: string
  description?: string
  points: RoutePoint[]
  climbType?: string
  color?: string
}
