import { describe, expect, it } from 'vitest'

import { getContentSecurityPolicy } from '@/lib/content-security-policy'

describe('getContentSecurityPolicy', () => {
  it('excludes unsafe-eval in production', () => {
    expect(getContentSecurityPolicy('production')).not.toContain("'unsafe-eval'")
  })

  it('retains unsafe-eval for development tooling', () => {
    expect(getContentSecurityPolicy('development')).toContain("'unsafe-eval'")
  })

  it('allows direct browser telemetry delivery to Sentry ingest', () => {
    expect(getContentSecurityPolicy('production')).toContain('https://*.sentry.io')
  })

  it('allows the configured staging media origin without accepting arbitrary CSP text', () => {
    const policy = getContentSecurityPolicy('production', 'https://static.staging.letsboulder.com/path')

    expect(policy).toContain('https://static.staging.letsboulder.com')
    expect(getContentSecurityPolicy('production', "javascript:alert('x')")).not.toContain('javascript:')
  })
})
