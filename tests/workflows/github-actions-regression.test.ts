import { readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

const root = process.cwd()

function workflow(name: string): string {
  return readFileSync(path.join(root, '.github', 'workflows', name), 'utf8')
}

function script(name: string): string {
  return readFileSync(path.join(root, 'scripts', 'media', name), 'utf8')
}

describe('GitHub Actions security contracts', () => {
  it('installs media worker dependencies before aggregate typechecking', () => {
    const content = workflow('test.yml')
    const qualityChecks = content.slice(
      content.indexOf('  quality-checks:'),
      content.indexOf('  generated-type-drift:'),
    )
    const mediaWorkerCheck = content.slice(
      content.indexOf('  media-worker-check:'),
      content.indexOf('  smoke:'),
    )

    expect(qualityChecks).toMatch(
      /cache-dependency-path: \|\s+package-lock\.json\s+apps\/media-worker\/package-lock\.json/,
    )

    const rootInstall = qualityChecks.indexOf('run: npm ci --prefer-offline')
    const workerInstall = qualityChecks.indexOf(
      'run: npm --prefix apps/media-worker ci --prefer-offline',
    )
    const aggregateTypecheck = qualityChecks.indexOf('run: npm run typecheck')

    expect(rootInstall).toBeGreaterThan(-1)
    expect(workerInstall).toBeGreaterThan(rootInstall)
    expect(aggregateTypecheck).toBeGreaterThan(workerInstall)
    expect(mediaWorkerCheck).toContain('name: Media Worker Check')
    expect(mediaWorkerCheck).toContain(
      'run: npm --prefix apps/media-worker ci --prefer-offline',
    )
    expect(mediaWorkerCheck).toContain('run: npm --prefix apps/media-worker run check')
  })

  it('keeps Supabase production apply behind a current-main manual dispatch', () => {
    const content = workflow('supabase-migrations.yml')

    expect(content).toContain("if: github.event_name == 'workflow_dispatch'")
    expect(content).toMatch(/commit_sha must be a full 40-character commit SHA/)
    expect(content).toMatch(/SELECTED_COMMIT_SHA.*MAIN_SHA/s)
    expect(content).toContain('run: npm ci --prefer-offline')
    expect(content).toContain('npx --no-install supabase link')
    expect(content).toContain('npx --no-install supabase db push --linked --include-all --dry-run')
    expect(content).toContain('npx --no-install supabase db push --linked --include-all')
    expect(content).not.toContain('supabase/setup-cli')
    expect(content).not.toContain('version: 2.84.2')
    expect(content).toMatch(/name: Apply migrations[\s\S]*if: github\.event_name == 'workflow_dispatch'/)

    const apply = content.indexOf('      - name: Apply migrations')
    const bookkeeping = content.indexOf('      - name: Prove production migration bookkeeping completed')
    const verification = content.indexOf('      - name: Verify production governance schema and roles read-only')
    const deployment = content.indexOf('      - name: Trigger production Vercel deployment')
    expect(apply).toBeGreaterThan(-1)
    expect(bookkeeping).toBeGreaterThan(apply)
    expect(verification).toBeGreaterThan(bookkeeping)
    expect(deployment).toBeGreaterThan(verification)
    expect(content).toContain('scripts/db/hosted-production-post-migration.sql')
    expect(content).toContain('production-playwright-smoke-')
    expect(workflow('test.yml')).not.toContain('name: Deploy to Vercel')
  })

  it('uploads the media delivery key to the production worker environment', () => {
    const content = workflow('media-worker-deploy.yml')
    const secretUpload = content.slice(
      content.indexOf('      - name: Upload production media worker secrets'),
      content.indexOf('      - name: Deploy production media worker'),
    )
    const deploy = content.slice(content.indexOf('      - name: Deploy production media worker'))

    expect(secretUpload).toContain('SUPABASE_ANON_KEY: ${{ vars.NEXT_PUBLIC_SUPABASE_ANON_KEY }}')
    expect(secretUpload).toContain('CLOUDFLARE_ACCOUNT_ID_RAW: ${{ vars.CLOUDFLARE_ACCOUNT_ID }}')
    expect(secretUpload).toContain("tr -d '[:space:]'")
    expect(secretUpload).toContain('export CLOUDFLARE_ACCOUNT_ID')
    expect(secretUpload).toContain('CLOUDFLARE_ACCOUNT_ID is missing or invalid')
    expect(secretUpload).toContain(
      'npx --no-install wrangler secret put SUPABASE_ANON_KEY --env production',
    )
    expect(secretUpload).toContain('NEXT_PUBLIC_SUPABASE_ANON_KEY is required')
    expect(deploy).toContain('command: deploy --env production')
    expect(deploy).not.toMatch(/^\s+secrets:/m)
  })

  it('uses the repository Supabase CLI in diagnostics', () => {
    const content = readFileSync(path.join(root, 'scripts', 'supabase-doctor.sh'), 'utf8')

    expect(content).toContain('npx --no-install supabase --version')
    expect(content).toContain('node_modules/.bin/supabase')
    expect(content).not.toContain('command -v supabase')
    expect(content).not.toContain('REQUIRED_VERSION=')
  })

  it('retains strict input validation on mutating maintenance workflows', () => {
    const canonical = workflow('media-canonical-migration.yml')
    const orphans = workflow('media-orphan-enqueue.yml')
    const recovery = workflow('production-media-lifecycle-recovery.yml')
    const backfill = workflow('media-backfill.yml')

    expect(canonical).toMatch(/CONFIRMATION.*MIGRATE/s)
    expect(canonical).toContain('Batch size must be an integer between 1 and 25')
    expect(orphans).toMatch(/CONFIRMATION.*ENQUEUE_ORPHANS/s)
    expect(orphans).toContain('Artifact digest must be a lowercase sha256 digest')
    expect(orphans).toContain('Batch size must be an integer between 1 and 25')
    expect(recovery).toMatch(/CONFIRMATION.*RECOVER_MEDIA_LIFECYCLE/s)
    expect(recovery).toContain('Health run ID or artifact digest is invalid')
    expect(backfill).toContain('batch_size must be a positive integer')
    expect(backfill).toContain('sample_image_id must be a UUID')
    expect(backfill).toContain('verify_wait_seconds must be a non-negative integer')
  })

  it('keeps authenticated Playwright credentials off preview deployments', () => {
    const deploymentUrl = script('../playwright/deployment-url.ts')
    const playwrightWorkflow = workflow('test.yml')
    const playwrightConfig = readFileSync(path.join(root, 'playwright.config.ts'), 'utf8')
    const globalSetup = readFileSync(path.join(root, 'global-setup.ts'), 'utf8')

    expect(deploymentUrl).toContain('authenticated_allowed=')
    expect(deploymentUrl).toContain('AUTHENTICATED_TRUSTED_HOSTS')
    expect(playwrightWorkflow).toContain("if: steps.resolve_base_url.outputs.authenticated_allowed == 'true'")
    expect(playwrightWorkflow).toContain("if: steps.resolve_base_url.outputs.authenticated_allowed != 'true'")
    expect(playwrightWorkflow).toContain("PLAYWRIGHT_AUTHENTICATED_SMOKE: 'true'")
    expect(playwrightConfig).toContain('validateAuthenticatedBaseUrl(resolvedBaseUrl)')
    expect(playwrightConfig).toContain("trace: 'off'")
    expect(globalSetup).toContain('validateAuthenticatedBaseUrl(baseURL)')
    expect(globalSetup).not.toContain('Authenticating via ${authUrl.toString()}')
    expect(globalSetup).not.toContain('Cookies set:')
  })

  it('runs public smoke after successful production deployments', () => {
    const playwrightWorkflow = workflow('test.yml')

    expect(playwrightWorkflow).toMatch(/^on:\n  deployment_status:\n/m)
    expect(playwrightWorkflow).toMatch(/github\.event_name == 'deployment_status'[\s\S]*github\.event\.deployment_status\.state == 'success'[\s\S]*github\.event\.deployment\.ref == 'main'[\s\S]*github\.event\.deployment\.environment == 'Production'/)
    expect(playwrightWorkflow).toContain("github.event_name == 'workflow_dispatch'")
    expect(playwrightWorkflow).toContain("PLAYWRIGHT_REQUESTED_BASE_URL: ${{ github.event_name == 'deployment_status' && 'https://letsboulder.com' || inputs.playwright_base_url || '' }}")
    expect(playwrightWorkflow.match(/if: github\.event_name != 'deployment_status'/g)).toHaveLength(5)
    expect(playwrightWorkflow).not.toContain('github.event.deployment_status.target_url')
  })

  it('parameterizes all media backfill SQL inputs', () => {
    const backfill = workflow('media-backfill.yml')
    const hostileValues = [
      "bucket' OR 1=1 --",
      'key; touch /tmp/pwned',
      'line\none-\u2603',
      '$(whoami) `id` && rm -rf /',
    ]

    expect(backfill).toContain("-v sample_image_id=\"$SAMPLE_IMAGE_ID\"")
    expect(backfill).toContain("-v original_bucket=\"$original_bucket\"")
    expect(backfill).toContain("-v original_key=\"$original_key\"")
    expect(backfill).toContain("-v selected_ids=\"$selected_ids\"")
    expect(backfill).toContain("NULLIF(:'sample_image_id', '')::uuid")
    expect(backfill).toContain("jsonb_array_elements_text(:'selected_ids'::jsonb)")

    for (const value of hostileValues) expect(backfill).not.toContain(value)
    expect(backfill).not.toMatch(/queue_media_ingest_job\('\$\{?image_id|queue_media_ingest_job\('\$image_id/)
    expect(backfill).not.toContain('IN (${ids_sql})')
    expect(backfill).not.toContain("'$SAMPLE_IMAGE_ID'::uuid")
  })

  it('retains strict UUID validation before parameterized SQL execution', () => {
    const backfill = workflow('media-backfill.yml')
    expect(backfill).toContain('sample_image_id must be a UUID')
    expect(backfill).toMatch(/SAMPLE_IMAGE_ID.*\^\[0-9a-fA-F-\]\{36\}\$/s)
    expect(backfill).toContain("NULLIF(:'sample_image_id', '')::uuid")
  })

  it('keeps dry-run paths read-only and before mutation calls', () => {
    const canonical = script('migrate-canonical-webp.ts')
    const orphans = script('enqueue-reconciled-orphans.ts')
    const recovery = script('recover-production-lifecycle.ts')

    expect(canonical).toContain('if (dryRun) return { imageId: image.id, status: \'validated\' }')
    expect(canonical.indexOf('if (dryRun) return')).toBeLessThan(canonical.indexOf('await s3.send(new PutObjectCommand'))
    expect(orphans).toContain('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ${readOnly ? \' READ ONLY\' : \'\'}')
    expect(orphans).toMatch(/if \(dryRun\) \{[\s\S]*beginServiceTransaction\(client, true\)[\s\S]*return/s)
    expect(orphans.indexOf('if (dryRun) {')).toBeLessThan(orphans.indexOf('enqueueCandidates(client'))
    expect(recovery).toContain('BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE${dryRun ? \' READ ONLY\' : \'\'}')
    expect(recovery).toMatch(/if \(dryRun\) \{[\s\S]*client\.query[\s\S]*\} else \{/s)
    expect(recovery).toMatch(/\} else \{[\s\S]*const recovered[\s\S]*functionName/s)
  })

  it('keeps uploaded maintenance artifacts schema-versioned and secret-free', () => {
    const health = workflow('production-media-http-health.yml')
    const lifecycle = workflow('production-media-lifecycle-health.yml')
    const orphanScript = script('enqueue-reconciled-orphans.ts')
    const recoveryScript = script('recover-production-lifecycle.ts')

    expect(health).toContain('"schemaVersion":1')
    expect(lifecycle).toContain('"schemaVersion":1')
    expect(orphanScript).toContain('schemaVersion: 1')
    expect(recoveryScript).toContain('schemaVersion: 1')
    expect(orphanScript).toContain('{ encoding: \'utf8\', mode: 0o600 }')
    expect(recoveryScript).toContain('{ encoding: \'utf8\', mode: 0o600 }')
    for (const content of [health, lifecycle, orphanScript, recoveryScript]) {
      expect(content).not.toMatch(/JSON\.stringify\([^)]*(?:PASSWORD|TOKEN|SECRET)/s)
    }
  })

  it('uses dedicated read-only S3 credentials for R2 inventories', () => {
    const privateInventory = workflow('r2-inventory.yml')
    const publicInventory = workflow('r2-public-inventory.yml')

    expect(privateInventory).toContain('R2_PRIVATE_INVENTORY_ACCESS_KEY_ID')
    expect(privateInventory).toContain('R2_PRIVATE_INVENTORY_SECRET_ACCESS_KEY')
    expect(publicInventory).toContain('R2_PUBLIC_INVENTORY_ACCESS_KEY_ID')
    expect(publicInventory).toContain('R2_PUBLIC_INVENTORY_SECRET_ACCESS_KEY')

    for (const content of [privateInventory, publicInventory]) {
      expect(content).not.toContain('CLOUDFLARE_API_TOKEN')
      expect(content).not.toContain('/user/tokens/verify')
      expect(content).not.toContain('sha256sum')
      expect(content).toContain('list-objects-v2')
      expect(content).toContain('--max-items 1')
      expect(content).toContain('--no-paginate')
      expect(content).toContain('::add-mask::')
      expect(content).toContain('AWS_EC2_METADATA_DISABLED=true')
      expect(content).toContain('rm -f')
    }

    expect(privateInventory).toContain('R2_BUCKET: lb-prod-media-private')
    expect(publicInventory).toContain('R2_BUCKET: lb-prod-media-public')
    expect(privateInventory).toContain('path: lb-prod-media-private-inventory.json')
    expect(publicInventory).toContain('path: lb-prod-media-public-inventory.json')
  })

  it('uses the shared production R2 credential names for media remediation', () => {
    const remediation = workflow('production-media-remediation.yml')

    expect(remediation).toContain('R2_ACCESS_KEY_ID: ${{ secrets.R2_ACCESS_KEY_ID }}')
    expect(remediation).toContain('R2_SECRET_ACCESS_KEY: ${{ secrets.R2_SECRET_ACCESS_KEY }}')
    expect(remediation).not.toContain('R2_PRIVATE_INVENTORY_ACCESS_KEY_ID')
    expect(remediation).not.toContain('R2_PRIVATE_INVENTORY_SECRET_ACCESS_KEY')
  })

  it('keeps production media automation bounded, protected, and non-destructive', () => {
    const automation = workflow('production-media-lifecycle-automation.yml')
    const runner = script('automate-production-media-lifecycle.ts')

    expect(automation).toContain("cron: '37 * * * *'")
    expect(automation).toContain('environment: Production')
    expect(automation).toContain('group: production-media-lifecycle-automation')
    expect(automation).toMatch(/permissions:\n  contents: read\n  actions: read/)
    expect(automation).toContain('Mode must be observe or apply')
    expect(automation).toContain('Batch size must be an integer between 1 and 25')
    expect(automation).toContain('Apply confirmation must exactly equal APPLY_MEDIA_LIFECYCLE_RECOVERY')
    expect(automation).toContain('R2_ACCESS_KEY_ID: ${{ secrets.R2_ACCESS_KEY_ID }}')
    expect(automation).toContain('R2_SECRET_ACCESS_KEY: ${{ secrets.R2_SECRET_ACCESS_KEY }}')
    expect(automation).toContain('SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}')
    expect(automation).toContain('production-media-lifecycle-automation-${{ github.run_id }}')
    expect(runner).toContain('schemaVersion: 1')
    expect(runner).toContain('await requireMatchingOrphan(s3, candidate)')
    expect(runner).toContain(".rpc('enqueue_reconciled_media_orphans'")
    expect(runner).toContain(".rpc('quarantine_missing_media_references'")
    expect(runner).not.toContain('DeleteObjectCommand')
    expect(automation).not.toMatch(/(?:aws s3 rm|rclone delete|wrangler r2 object delete)/)
  })
})
