import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(process.cwd())
const read = (path: string) => readFileSync(resolve(root, path), 'utf8')

describe('media worker routing convergence', () => {
  it('uses isolated Custom Domains and resources for staging and production', () => {
    const wrangler = read('apps/media-worker/wrangler.toml')

    expect(wrangler).toContain('pattern = "static.staging.letsboulder.com"\ncustom_domain = true')
    expect(wrangler).toContain('pattern = "static.letsboulder.com"\ncustom_domain = true')
    expect(wrangler).not.toContain('pattern = "static.letsboulder.com/*"')
    expect(wrangler).not.toContain('static.dev.letsboulder.com')

    expect(wrangler).toContain('bucket_name = "lb-staging-media-private"')
    expect(wrangler).toContain('bucket_name = "lb-staging-media-public"')
    expect(wrangler).toContain('queue = "media-transform-queue-staging"')
    expect(wrangler).toContain('bucket_name = "lb-prod-media-private"')
    expect(wrangler).toContain('bucket_name = "lb-prod-media-public"')
    expect(wrangler).toContain('queue = "media-transform-queue-prod"')
    expect(wrangler).toContain('redact_query_string = false')
  })

  it('keeps the legacy production alias explicitly transitional', () => {
    const wrangler = read('apps/media-worker/wrangler.toml')

    expect(wrangler).toContain('Temporary compatibility alias during the Route -> Custom Domain migration.')
    expect(wrangler).toContain('pattern = "media.letsboulder.com"\ncustom_domain = true')
  })

  it('uses strict versioned deployment plus explicit trigger reconciliation', () => {
    for (const workflow of [
      '.github/workflows/media-worker-staging-deploy.yml',
      '.github/workflows/media-worker-deploy.yml',
    ]) {
      const content = read(workflow)
      expect(content).toContain('WRANGLER_DEPLOY_VERSION: "4.129.1"')
      expect(content).toContain('triggers deploy')
      expect(content).toContain('--dry-run')
      expect(content).toContain('versions upload')
      expect(content).toContain('--strict')
      expect(content).toContain('versions deploy')
    }

    const staging = read('.github/workflows/media-worker-staging-deploy.yml')
    expect(staging).not.toContain('wrangler secret put')
    expect(staging).not.toContain('cloudflare/wrangler-action')

    const production = read('.github/workflows/media-worker-deploy.yml')
    expect(production).toContain('queues consumer worker add')
    expect(production).toContain('media-transform-queue-prod')
    expect(production).toContain("CF_MEDIA_WORKER_URL must target the production static media Custom Domain")
  })

  it('allows offline and browser delivery from the current staging hostname', () => {
    const csp = read('lib/content-security-policy.ts')
    const serviceWorker = read('public/sw.js')
    const envExample = read('.env.example')

    for (const content of [csp, serviceWorker, envExample]) {
      expect(content).toContain('static.staging.letsboulder.com')
      expect(content).toContain('static.letsboulder.com')
      expect(content).not.toContain('static.dev.letsboulder.com')
    }

    expect(envExample).not.toContain('lb-dev-media-private')
    expect(envExample).not.toContain('lb-dev-media-public')
  })
})
