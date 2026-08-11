import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  isAuthenticatedTrustedBaseUrl,
  resolvePlaywrightBaseUrl,
  validateAuthenticatedBaseUrl,
  validateTrustedBaseUrl,
} from '@/scripts/playwright/deployment-url'

describe('validateTrustedBaseUrl', () => {
  it('accepts the trusted production origin for public tests', () => {
    expect(validateTrustedBaseUrl('https://letsboulder.com')).toBe('https://letsboulder.com')
  })

  it('accepts a verified Vercel deployment host when explicitly enabled', () => {
    expect(validateTrustedBaseUrl('https://letsboulder-preview.vercel.app', true)).toBe('https://letsboulder-preview.vercel.app')
  })

  it('rejects Vercel deployments for authenticated tests', () => {
    expect(() => validateAuthenticatedBaseUrl('https://letsboulder-preview.vercel.app')).toThrow()
    expect(isAuthenticatedTrustedBaseUrl('https://letsboulder-preview.vercel.app')).toBe(false)
  })

  it('rejects production for authenticated tests', () => {
    expect(() => validateAuthenticatedBaseUrl('https://letsboulder.com')).toThrow()
    expect(isAuthenticatedTrustedBaseUrl('https://letsboulder.com')).toBe(false)
  })

  it.each([
    'https://attacker.vercel.app',
    'https://letsboulder.com.attacker.example',
    'https://letsboulder.com@attacker.example',
    'https://letsboulder.com:444',
    'http://letsboulder.com',
    'https://user:password@letsboulder.com',
    'https://letsboulder.com:443',
    'https://letsboulder.com/path',
    'https://letsboulder.com/%2F',
    'https://letsboulder.com/?inject=1',
    'https://localhost:3000',
  ])('rejects unsafe URL %s', url => {
    expect(() => validateTrustedBaseUrl(url)).toThrow()
  })

})

describe('resolvePlaywrightBaseUrl', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('accepts a verified preview deployment owned by the configured project', async () => {
    vi.stubEnv('VERCEL_DEPLOYMENT_ID', 'dpl_verified')
    vi.stubEnv('VERCEL_API_TOKEN', 'token')
    vi.stubEnv('VERCEL_PROJECT_ID', 'project-1')
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      url: 'letsboulder-preview.vercel.app',
      projectId: 'project-1',
      target: 'preview',
    })))

    await expect(resolvePlaywrightBaseUrl()).resolves.toBe('https://letsboulder-preview.vercel.app')
  })

  it('rejects a preview deployment that is not owned by the configured project', async () => {
    vi.stubEnv('VERCEL_DEPLOYMENT_ID', 'dpl_untrusted')
    vi.stubEnv('VERCEL_API_TOKEN', 'token')
    vi.stubEnv('VERCEL_PROJECT_ID', 'project-1')
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      url: 'attacker.vercel.app',
      projectId: 'project-2',
      target: 'preview',
    })))

    await expect(resolvePlaywrightBaseUrl()).rejects.toThrow('does not belong to the configured project')
  })
})
