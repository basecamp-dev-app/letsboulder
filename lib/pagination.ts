export interface Pagination {
  limit: number
  offset: number
}

export function parsePagination(
  searchParams: URLSearchParams,
  defaults: { limit?: number; offset?: number } = {}
): Pagination {
  const defaultLimit = defaults.limit ?? 20
  const defaultOffset = defaults.offset ?? 0

  const rawLimit = searchParams.get('limit')
  const rawOffset = searchParams.get('offset')

  const parsedLimit = Number.parseInt(rawLimit || '', 10)
  const parsedOffset = Number.parseInt(rawOffset || '', 10)

  const safeLimitBase = Number.isNaN(parsedLimit) ? defaultLimit : parsedLimit
  const safeOffsetBase = Number.isNaN(parsedOffset) ? defaultOffset : parsedOffset

  const limit = Math.max(1, Math.min(safeLimitBase || 20, 100))
  const offset = Math.max(0, safeOffsetBase || 0)

  return { limit, offset }
}
