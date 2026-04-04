export interface ActionResult<T = void> {
  success: boolean
  data?: T
  error?: string
  status?: number
  fieldErrors?: Record<string, string[] | undefined>
}

export function ok<T>(data?: T): ActionResult<T> {
  return data === undefined ? { success: true } : { success: true, data }
}

export function fail<T = void>(
  error: string,
  status: number,
  fieldErrors?: Record<string, string[] | undefined>
): ActionResult<T> {
  return fieldErrors ? { success: false, error, status, fieldErrors } : { success: false, error, status }
}
