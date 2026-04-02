export interface ActionResult<T = void> {
  success: boolean
  data?: T
  error?: string
  status?: number
}

export function ok<T>(data?: T): ActionResult<T> {
  return data === undefined ? { success: true } : { success: true, data }
}

export function fail<T = void>(error: string, status: number): ActionResult<T> {
  return { success: false, error, status }
}
