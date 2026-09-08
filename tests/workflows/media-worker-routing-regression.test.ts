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

  it('keeps observability defaults explicit for strict remote drift checks', () => {
    const config = read('apps/media-worker/wrangler.toml')

    expect(config.match(/redact_query_string = false/g)).toHaveLength(3)
    expect(config.match(/head_sampling_rate = 1/g)).toHaveLength(3)
  })

  it('keeps version uploads strict by default and reconciles triggers before upload', () => {
    const production = read('.github/workflows/media-worker-deploy.yml')
    const staging = read('.github/workflows/media-worker-staging-deploy.yml')

    for (const workflow of [production, staging]) {
      expect(workflow).toContain('wrangler versions upload')
      expect(workflow).toContain('--strict')
      expect(workflow).toContain('wrangler triggers deploy')
      expect(workflow).toContain('--dry-run')
      expect(workflow).toContain('wrangler versions deploy')
      expect(workflow).toContain('--version-tag "${WORKER_VERSION_TAG}@100%"')
    }

    expect(production.indexOf('Reconcile production routes and cron before version upload'))
      .toBeLessThan(production.indexOf('Create production Worker version with synchronized credentials'))
    expect(staging.indexOf('Reconcile staging routes and cron before strict version upload'))
      .toBeLessThan(staging.indexOf('Create staging Worker version with synchronized credentials'))
    expect(production).toContain('strict_args=(--strict)')
    expect(production).toContain('https://static.letsboulder.com/enqueue')
    expect(staging).toContain('https://static.staging.letsboulder.com/enqueue')
    expect(staging).not.toContain('wrangler secret put')
    expect(staging).not.toContain('Ensure staging media infrastructure exists')
  })

  it('gates the incident-only production convergence path to an exact manual main commit', () => {
    const production = read('.github/workflows/media-worker-deploy.yml')

    expect(production).toContain('allow_known_config_convergence:')
    expect(production).toContain('expected_main_sha:')
    expect(production).toContain('default: false')
    expect(production).toContain('Authorize one-time production configuration convergence')
    expect(production).toContain("if: ${{ github.event_name == 'workflow_dispatch' && inputs.allow_known_config_convergence }}")
    expect(production).toContain('if [ "$GITHUB_REF" != "refs/heads/main" ]; then')
    expect(production).toContain('if [ "$EXPECTED_MAIN_SHA" != "$GITHUB_SHA" ]; then')
    expect(production).toContain("ALLOW_KNOWN_CONFIG_CONVERGENCE: ${{ github.event_name == 'workflow_dispatch' && inputs.allow_known_config_convergence && 'true' || 'false' }}")
    expect(production).toContain('strict_args=()')
    expect(production).toContain('incident-only non-strict upload')
    expect(production.indexOf('Authorize one-time production configuration convergence'))
      .toBeLessThan(production.indexOf('Preview production route and cron reconciliation'))
  })

  it('seeds only missing required production secrets during the authorized convergence', () => {
    const production = read('.github/workflows/media-worker-deploy.yml')

    const convergenceGuard = production.indexOf('if [ "$ALLOW_KNOWN_CONFIG_CONVERGENCE" = "true" ]; then')
    const secretList = production.indexOf('wrangler secret list --env production --format json')
    const upload = production.indexOf('wrangler versions upload')

    expect(convergenceGuard).toBeGreaterThan(-1)
    expect(secretList).toBeGreaterThan(convergenceGuard)
    expect(secretList).toBeLessThan(upload)
    expect(production).toContain('CF_MEDIA_WORKER_SECRET: ${{ secrets.CF_MEDIA_WORKER_SECRET }}')
    expect(production).toContain('if ! has_secret INGRESS_SECRET; then')
    expect(production).toContain('INCIDENT_INGRESS_SECRET="$CF_MEDIA_WORKER_SECRET"')
    expect(production).toContain('if ! has_secret INTERNAL_ORIGIN_SECRET; then')
    expect(production).toContain('INCIDENT_INTERNAL_ORIGIN_SECRET="$(openssl rand -hex 32)"')
    expect(production).toContain('payload.INGRESS_SECRET=process.env.INCIDENT_INGRESS_SECRET')
    expect(production).toContain('payload.INTERNAL_ORIGIN_SECRET=process.env.INCIDENT_INTERNAL_ORIGIN_SECRET')
  })

  it('reconciles the known-missing production queue consumer and verifies staging', () => {
    const production = read('.github/workflows/media-worker-deploy.yml')
    const staging = read('.github/workflows/media-worker-staging-deploy.yml')

    expect(production).toContain('wrangler queues consumer list media-transform-queue-prod --json')
    expect(production).toContain('wrangler queues consumer add')
    expect(production).toContain('media-worker-production')
    expect(production).toContain('--batch-size 1')
    expect(production).toContain('--batch-timeout 5')
    expect(production).toContain('--message-retries 3')
    expect(production.indexOf('Reconcile production queue consumer'))
      .toBeLessThan(production.indexOf('Create production Worker version with synchronized credentials'))

    expect(staging).toContain('wrangler queues consumer list media-transform-queue-staging --json')
    expect(staging).toContain('media-worker-staging')
    expect(staging).toContain('Staging media queue consumer is missing')
    expect(staging.indexOf('Verify staging queue consumer'))
      .toBeLessThan(staging.indexOf('Create staging Worker version with synchronized credentials'))
  })

  it('requires canonical media URLs before trigger mutation', () => {
    const production = read('.github/workflows/media-worker-deploy.yml')
    const staging = read('.github/workflows/media-worker-staging-deploy.yml')

    for (const workflow of [production, staging]) {
      expect(workflow).toContain('GITHUB_CF_MEDIA_WORKER_URL')
      expect(workflow).toContain('GITHUB_MEDIA_CDN_URL')
      expect(workflow).toMatch(/required=\([^\n]*GITHUB_CF_MEDIA_WORKER_URL GITHUB_MEDIA_CDN_URL\)/)
    }
  })

  it('validates required Worker secrets without copying production-only values between environments', () => {
    const config = read('apps/media-worker/wrangler.toml')
    const production = read('.github/workflows/media-worker-deploy.yml')

    expect(config).toContain('[env.staging.secrets]')
    expect(config).toContain('[env.production.secrets]')
    expect(config).toContain('required = ["SUPABASE_SERVICE_ROLE_KEY", "INGRESS_SECRET", "INTERNAL_ORIGIN_SECRET"]')
    expect(production).toContain('Existing omitted secrets are preserved')
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
