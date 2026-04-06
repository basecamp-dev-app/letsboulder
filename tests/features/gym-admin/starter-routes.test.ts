import { describe, expect, test } from 'vitest'
import { starterRouteSchema, saveStarterRoutesSchema, parseSaveStarterRoutesRequest } from '@/features/gym-admin/server/starter-routes'

describe('starterRouteSchema', () => {
  test('validates valid route with minimal fields', () => {
    const validRoute = {
      floor_plan_id: 'fp-123',
      grade: 'V4',
      discipline: 'boulder',
      marker: { x_norm: 0.5, y_norm: 0.5 },
    }

    const result = starterRouteSchema.safeParse(validRoute)
    expect(result.success).toBe(true)
  })

  test('validates valid route with all optional fields', () => {
    const validRoute = {
      id: 'route-123',
      floor_plan_id: 'fp-123',
      name: 'Test Route',
      grade: 'V4',
      discipline: 'sport',
      color: 'blue',
      setter_name: 'John',
      status: 'retired',
      marker: { x_norm: 0.5, y_norm: 0.5 },
    }

    const result = starterRouteSchema.safeParse(validRoute)
    expect(result.success).toBe(true)
  })

  test('rejects missing required fields', () => {
    const invalidRoute = {
      floor_plan_id: 'fp-123',
    }

    const result = starterRouteSchema.safeParse(invalidRoute)
    expect(result.success).toBe(false)
  })

  test('rejects invalid discipline', () => {
    const invalidRoute = {
      floor_plan_id: 'fp-123',
      grade: 'V4',
      discipline: 'lead',
      marker: { x_norm: 0.5, y_norm: 0.5 },
    }

    const result = starterRouteSchema.safeParse(invalidRoute)
    expect(result.success).toBe(false)
  })

  test('rejects invalid status', () => {
    const invalidRoute = {
      floor_plan_id: 'fp-123',
      grade: 'V4',
      discipline: 'boulder',
      status: 'invalid',
      marker: { x_norm: 0.5, y_norm: 0.5 },
    }

    const result = starterRouteSchema.safeParse(invalidRoute)
    expect(result.success).toBe(false)
  })

  test('rejects missing marker', () => {
    const invalidRoute = {
      floor_plan_id: 'fp-123',
      grade: 'V4',
      discipline: 'boulder',
    }

    const result = starterRouteSchema.safeParse(invalidRoute)
    expect(result.success).toBe(false)
  })

  test('rejects invalid marker structure', () => {
    const invalidRoute = {
      floor_plan_id: 'fp-123',
      grade: 'V4',
      discipline: 'boulder',
      marker: 'not-an-object',
    }

    const result = starterRouteSchema.safeParse(invalidRoute)
    expect(result.success).toBe(false)
  })
})

describe('saveStarterRoutesSchema', () => {
  test('validates request with routes array', () => {
    const validRequest = {
      routes: [
        { floor_plan_id: 'fp-123', grade: 'V4', discipline: 'boulder', marker: { x_norm: 0.5, y_norm: 0.5 } },
        { floor_plan_id: 'fp-123', grade: 'V5', discipline: 'sport', marker: { x_norm: 0.3, y_norm: 0.7 } },
      ],
    }

    const result = saveStarterRoutesSchema.safeParse(validRequest)
    expect(result.success).toBe(true)
  })

  test('defaults routes to empty array when not provided', () => {
    const validRequest = {}

    const result = saveStarterRoutesSchema.safeParse(validRequest)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.routes).toEqual([])
    }
  })

  test('rejects non-array routes', () => {
    const invalidRequest = {
      routes: 'not-an-array',
    }

    const result = saveStarterRoutesSchema.safeParse(invalidRequest)
    expect(result.success).toBe(false)
  })

  test('rejects invalid route in array', () => {
    const invalidRequest = {
      routes: [
        { floor_plan_id: 'fp-123', discipline: 'boulder', marker: { x_norm: 0.5, y_norm: 0.5 } },
      ],
    }

    const result = saveStarterRoutesSchema.safeParse(invalidRequest)
    expect(result.success).toBe(false)
  })
})

describe('parseSaveStarterRoutesRequest', () => {
  test('parses valid request body with routes', () => {
    const body = {
      routes: [
        { floor_plan_id: 'fp-123', grade: 'V4', discipline: 'boulder', marker: { x_norm: 0.5, y_norm: 0.5 } },
      ],
    }

    const result = parseSaveStarterRoutesRequest(body)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.routes).toHaveLength(1)
    }
  })

  test('defaults to empty routes array when not provided', () => {
    const body = {}

    const result = parseSaveStarterRoutesRequest(body)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.routes).toEqual([])
    }
  })

  test('rejects invalid request body', () => {
    const body = {
      routes: 'invalid',
    }

    const result = parseSaveStarterRoutesRequest(body)
    expect(result.success).toBe(false)
  })
})
