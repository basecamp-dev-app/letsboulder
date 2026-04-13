import { describe, expect, test } from 'vitest'

function buildCragHref(input: { id: string; slug: string | null; countryCode: string | null }) {
  if (input.slug && input.countryCode) {
    return `/${input.countryCode.toLowerCase()}/${input.slug}`
  }

  return `/crag/${input.id}`
}

describe('crag href behavior', () => {
  test('uses canonical slug instead of deriving one from display name', () => {
    expect(buildCragHref({ id: 'crag-1', slug: 'harrisons-rocks', countryCode: 'GB' })).toBe('/gb/harrisons-rocks')
  })

  test('falls back to id route when slug is unavailable', () => {
    expect(buildCragHref({ id: 'crag-1', slug: null, countryCode: 'GB' })).toBe('/crag/crag-1')
  })
})
