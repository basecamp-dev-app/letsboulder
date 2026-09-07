import { readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

const root = process.cwd()

function read(relativePath: string): string {
  return readFileSync(path.join(root, relativePath), 'utf8')
}

describe('media worker routing convergence', () => {
  it('uses canonical Worker Custom Domains instead of the production zone Route', () => {
    const config = read('apps/media-worker/wrangler.toml')

    expect(config).toContain('pattern = "static.staging.letsboulder.com"\ncustom_domain = true')
    expect(config).toContain('pattern = "static.letsboulder.com"\ncustom_domain = true')
    expect(config).not.toContain('pattern = "static.letsboulder.com/*"')
    expect(config).not.toContain('zone_name = "letsboulder.com"')

    // The compatibility alias is intentionally temporary. Its comment prevents
    // it from becoming an undocumented canonical endpoint while external
    // dependencies are migrated.
    expect(config).toContain('Temporary compatibility alias')
    expect(config).toContain('pattern = "media.letsboulder.com"\ncustom_domain = true')
  })

  it('keeps staging and production media resources isolated', () => {
    const config = read('apps/media-worker/wrangler.toml')

    expect(config).toContain('R2_PRIVATE_BUCKET = "lb-staging-media-private"')
    expect(config).toContain('R2_PUBLIC_BUCKET = "lb-staging-media-public"')
    expect(config).toContain('queue = "media-transform-queue-staging"')
    expect(config).toContain('R2_PRIVATE_BUCKET = "lb-prod-media-private"')
    expect(config).toContain('R2_PUBLIC_BUCKET = "lb-prod-media-public"')
    expect(config).toContain('queue = "media-transform-queue-prod"')
    expect(config).toContain('max_batch_size = 1')
    expect(config).toContain('max_batch_timeout = 5')
    expect(config).toContain('max_retries = 3')
  })

  it('keeps version uploads strict and applies routes/domains explicitly', () => {
    const production = read('.github/workflows/media-worker-deploy.yml')
    const staging = read('.github/workflows/media-worker-staging-deploy.yml')

    for (const workflow of [production, staging]) {
      expect(workflow).toContain('wrangler versions upload')
      expect(workflow).toContain('--strict')
      expect(workflow).toContain('wrangler triggers deploy')
      expect(workflow).toContain('wrangler versions deploy')
      expect(workflow).toContain('--version-tag "${WORKER_VERSION_TAG}@100%"')
    }

    expect(production.indexOf('Reconcile production routes and cron before strict version upload'))
      .toBeLessThan(production.indexOf('Create production Worker version with synchronized credentials'))
    expect(production).toContain('https://static.letsboulder.com/enqueue')
    expect(staging).toContain('https://static.staging.letsboulder.com/enqueue')
    expect(staging).not.toContain('wrangler secret put')
    expect(staging).not.toContain('Ensure staging media infrastructure exists')
  })

  it('validates required Worker secrets without copying production-only values between environments', () => {
    const config = read('apps/media-worker/wrangler.toml')
    const production = read('.github/workflows/media-worker-deploy.yml')

    expect(config).toContain('[env.staging.secrets]')
    expect(config).toContain('[env.production.secrets]')
    expect(config).toContain('required = ["SUPABASE_SERVICE_ROLE_KEY", "INGRESS_SECRET", "INTERNAL_ORIGIN_SECRET"]')
    expect(production).toContain('Wrangler preserves existing omitted secrets')
    expect(production).not.toContain('INGRESS_SECRET: ${{ secrets.INGRESS_SECRET }}')
    expect(production).not.toContain('INTERNAL_ORIGIN_SECRET: ${{ secrets.INTERNAL_ORIGIN_SECRET }}')
  })

  it('uses only current staging media host and bucket names in runtime-facing references', () => {
    const files = [
      '.env.example',
      'README.md',
      'apps/media-worker/README.md',
      'docs/architecture.md',
      'docs/media-pipeline.md',
      'lib/content-security-policy.ts',
      'public/sw.js',
    ]

    for (const file of files) {
      const content = read(file)
      expect(content, file).not.toContain('static.dev.letsboulder.com')
      expect(content, file).not.toContain('lb-dev-media-private')
      expect(content, file).not.toContain('lb-dev-media-public')
    }

    const serviceWorker = read('public/sw.js')
    expect(serviceWorker).toContain("'https://static.staging.letsboulder.com'")
    expect(serviceWorker).toContain("'https://static.letsboulder.com'")

    const csp = read('lib/content-security-policy.ts')
    expect(csp).toContain("'https://static.staging.letsboulder.com'")
    expect(csp).toContain("'https://static.letsboulder.com'")
  })
})
