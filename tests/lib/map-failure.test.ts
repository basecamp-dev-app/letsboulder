import { describe, expect, it } from 'vitest'

import { classifyMapFailure } from '@/lib/map/map-failure'

describe('classifyMapFailure', () => {
  it('recognizes WebGL capability absence as fatal', () => {
    expect(classifyMapFailure(new Error('Failed to initialize WebGL'))).toMatchObject({
      kind: 'webgl-unavailable',
      severity: 'fatal',
    })
  })

  it('distinguishes recoverable initialization and post-load resource failures', () => {
    expect(classifyMapFailure(new Error('Constructor failed'))).toMatchObject({
      kind: 'initialization',
      severity: 'fatal',
    })
    expect(classifyMapFailure(new Error('Tile request failed'), { resource: true, fatal: false })).toMatchObject({
      kind: 'resource',
      severity: 'degraded',
    })
  })
})
