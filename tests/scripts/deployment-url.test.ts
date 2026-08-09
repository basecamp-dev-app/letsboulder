import { describe, expect, it } from 'vitest'
import { validateTrustedBaseUrl } from '@/scripts/playwright/deployment-url'

describe('validateTrustedBaseUrl', () => {
  it('accepts the trusted development origin', () => {
    expect(validateTrustedBaseUrl('https://dev.letsboulder.com')).toBe('https://dev.letsboulder.com')
  })

  it('accepts a verified Vercel deployment host when explicitly enabled', () => {
    expect(validateTrustedBaseUrl('https://letsboulder-preview.vercel.app', true)).toBe('https://letsboulder-preview.vercel.app')
  })

  it.each([
    'https://attacker.vercel.app',
    'https://dev.letsboulder.com.attacker.example',
    'https://dev.letsboulder.com@attacker.example',
    'https://dev.letsboulder.com:444',
    'http://dev.letsboulder.com',
    'https://user:password@dev.letsboulder.com',
    'https://dev.letsboulder.com:443',
    'https://dev.letsboulder.com/path',
    'https://dev.letsboulder.com/%2F',
    'https://dev.letsboulder.com/?inject=1',
    'https://localhost:3000',
  ])('rejects unsafe URL %s', url => {
    expect(() => validateTrustedBaseUrl(url)).toThrow()
  })

})
