import { describe, expect, test } from 'vitest'

function buildOfflineImageFirstUrl(input: {
  cragPath: string | null
  climbId: string
  displayImageId: string | null
  routeId: string | null
}) {
  if (!input.cragPath || !input.displayImageId) return null

  const query = new URLSearchParams()
  query.set('image', input.displayImageId)
  if (input.routeId) {
    query.set('route', input.routeId)
  }
  query.set('climb', input.climbId)
  return `${input.cragPath}/i/${input.displayImageId}?${query.toString()}`
}

describe('offline image-first launch url', () => {
  test('matches the live image-first query shape', () => {
    expect(buildOfflineImageFirstUrl({
      cragPath: '/ch/murgtal-2',
      climbId: '5878dd83-4c15-4531-9463-8b77273ab58d',
      displayImageId: '22022cce-1cc4-45ff-a28f-b33cbe7d1b9e',
      routeId: 'fcc25755-62f1-4224-b679-e72fe18d7028',
    })).toBe('/ch/murgtal-2/i/22022cce-1cc4-45ff-a28f-b33cbe7d1b9e?image=22022cce-1cc4-45ff-a28f-b33cbe7d1b9e&route=fcc25755-62f1-4224-b679-e72fe18d7028&climb=5878dd83-4c15-4531-9463-8b77273ab58d')
  })
})
