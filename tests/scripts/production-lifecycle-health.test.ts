import { describe, expect, it } from 'vitest'

import { classifyLifecycleAge } from '@/scripts/media/production-lifecycle-health'

describe('classifyLifecycleAge', () => {
  it('classifies only ages after the warning and critical thresholds', () => {
    expect(classifyLifecycleAge(30 * 60)).toBe('info')
    expect(classifyLifecycleAge(30 * 60 + 1)).toBe('warning')
    expect(classifyLifecycleAge(6 * 60 * 60)).toBe('warning')
    expect(classifyLifecycleAge(6 * 60 * 60 + 1)).toBe('critical')
  })

  it('classifies terminal and invariant findings as immediately critical', () => {
    expect(classifyLifecycleAge(0, true)).toBe('critical')
  })

  it('rejects invalid ages', () => {
    expect(() => classifyLifecycleAge(-1)).toThrow(/non-negative/)
    expect(() => classifyLifecycleAge(Number.NaN)).toThrow(/non-negative/)
  })
})
