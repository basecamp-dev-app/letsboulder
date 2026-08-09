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
  it('keeps Supabase production apply behind a current-main manual dispatch', () => {
    const content = workflow('supabase-migrations.yml')

    expect(content).toContain("if: github.event_name == 'workflow_dispatch'")
    expect(content).toMatch(/commit_sha must be a full 40-character commit SHA/)
    expect(content).toMatch(/SELECTED_COMMIT_SHA.*MAIN_SHA/s)
    expect(content).toContain('supabase db push --linked --include-all --dry-run')
    expect(content).toContain('supabase db push --linked --include-all')
    expect(content).toMatch(/name: Apply migrations[\s\S]*if: github\.event_name == 'workflow_dispatch'/)
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
})
