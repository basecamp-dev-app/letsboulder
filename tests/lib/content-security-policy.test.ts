import { describe, expect, it } from 'vitest'

import { getContentSecurityPolicy } from '@/lib/content-security-policy'

describe('getContentSecurityPolicy', () => {
  it('excludes unsafe-eval in production', () => {
    expect(getContentSecurityPolicy('production')).not.toContain("'unsafe-eval'")
  })

  it('retains unsafe-eval for development tooling', () => {
    expect(getContentSecurityPolicy('development')).toContain("'unsafe-eval'")
  })
})
