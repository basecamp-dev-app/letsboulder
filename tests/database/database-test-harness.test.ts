import { describe, expect, it } from 'vitest'

import { validateDatabaseTestUrl } from './database-test-harness'

describe('database test URL validation', () => {
  it('accepts PostgreSQL loopback URLs', () => {
    expect(validateDatabaseTestUrl('postgresql://postgres:postgres@127.0.0.1:54322/postgres'))
      .toContain('127.0.0.1')
    expect(validateDatabaseTestUrl('postgres://postgres:postgres@[::1]:54322/postgres'))
      .toContain('::1')
  })

  it('refuses non-loopback hosts without explicit opt-in', () => {
    expect(() => validateDatabaseTestUrl('postgresql://postgres:postgres@example.test/postgres'))
      .toThrow('Refusing database tests against non-loopback host example.test')
  })

  it('allows a non-loopback URL only with explicit opt-in', () => {
    expect(validateDatabaseTestUrl('postgresql://postgres:postgres@example.test/postgres', true))
      .toContain('example.test')
  })

  it('refuses invalid and non-PostgreSQL URLs', () => {
    expect(() => validateDatabaseTestUrl('not a url')).toThrow('valid PostgreSQL URL')
    expect(() => validateDatabaseTestUrl('https://127.0.0.1/postgres'))
      .toThrow('postgres or postgresql protocol')
  })
})
