import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

const root = process.cwd()

function workflow(name: string): string {
  return readFileSync(path.join(root, '.github', 'workflows', name), 'utf8')
}

describe('production release workflow', () => {
  it('releases only the current main SHA from a staging promotion after mandatory checks', () => {
    const content = workflow('supabase-migrations.yml')

    expect(content).toContain('name: Production Release')
    expect(content).toMatch(/workflow_run:\s+workflows: \[CI\]\s+types: \[completed\]/)
    expect(content).toContain("github.event.workflow_run.event == 'push'")
    expect(content).toContain("github.event.workflow_run.head_branch == 'main'")
    expect(content).toContain("github.event.workflow_run.conclusion == 'success'")
    expect(content).toContain('github.event.workflow_run.head_sha')
    expect(content).toContain('Verify selected commit is current main')
    expect(content).toContain('Verify current main came from staging promotion')
    expect(content).toContain('.base.ref == "main"')
    expect(content).toContain('.head.ref == "staging"')

    for (const check of [
      'Quality Checks',
      'Generated Database Type Drift',
      'Next.js Build',
      'Unit Tests',
      'Component Tests',
      'Offline Reliability',
      'Media Worker Check',
      'Dependency audits',
    ]) {
      expect(content).toContain(`'${check}'`)
    }

    const checkGate = content.indexOf(
      '      - name: Verify mandatory release checks for selected main SHA',
    )
    const dryRun = content.indexOf(
      '      - name: Preview migrations and detect pending production changes',
    )
    const deployment = content.indexOf('      - name: Trigger production Vercel deployment')
    expect(checkGate).toBeGreaterThan(-1)
    expect(dryRun).toBeGreaterThan(checkGate)
    expect(deployment).toBeGreaterThan(dryRun)
  })

  it('automates code-only deploys while keeping migration releases database-first and protected', () => {
    const content = workflow('supabase-migrations.yml')

    expect(content).toContain('environment: Production')
    expect(content).toContain('VERCEL_DEPLOY_HOOK: ${{ secrets.VERCEL_DEPLOY_HOOK }}')
    expect(content).toContain(
      'npx --no-install supabase db push --linked --include-all --dry-run',
    )
    expect(content).toContain(
      "if: github.event_name == 'workflow_run' && steps.migration_state.outputs.pending == 'true'",
    )
    expect(content).toContain(
      "if: github.event_name == 'workflow_dispatch' && steps.migration_state.outputs.pending == 'true'",
    )
    expect(content).toContain('Pending production migrations detected')
    expect(content).toContain('Production migration history is already current.')

    const apply = content.indexOf('      - name: Apply migrations')
    const bookkeeping = content.indexOf(
      '      - name: Prove production migration bookkeeping completed',
    )
    const verification = content.indexOf(
      '      - name: Verify production governance schema and roles read-only',
    )
    const mainRecheck = content.indexOf(
      '      - name: Verify selected commit remains current main before deployment',
    )
    const deployment = content.indexOf('      - name: Trigger production Vercel deployment')

    expect(apply).toBeGreaterThan(-1)
    expect(bookkeeping).toBeGreaterThan(apply)
    expect(verification).toBeGreaterThan(bookkeeping)
    expect(mainRecheck).toBeGreaterThan(verification)
    expect(deployment).toBeGreaterThan(mainRecheck)
  })

  it('keeps one production Vercel deploy authority and the existing deployment-status smoke path', () => {
    const workflowDir = path.join(root, '.github', 'workflows')
    const productionHookWorkflows = readdirSync(workflowDir)
      .filter((name) => /\.ya?ml$/.test(name))
      .filter((name) => {
        const content = workflow(name)
        return content.includes('environment: Production') && content.includes('VERCEL_DEPLOY_HOOK')
      })

    expect(productionHookWorkflows).toEqual(['supabase-migrations.yml'])

    const staging = workflow('supabase-migrations-staging.yml')
    expect(staging).toContain('environment: Staging')
    expect(staging).toContain('VERCEL_DEPLOY_HOOK: ${{ secrets.VERCEL_DEPLOY_HOOK }}')

    const ci = workflow('test.yml')
    expect(ci).toMatch(/^on:\n  deployment_status:\n/m)
    expect(ci).toMatch(
      /github\.event\.deployment_status\.state == 'success'[\s\S]*github\.event\.deployment\.ref == 'main'[\s\S]*github\.event\.deployment\.environment == 'Production'/,
    )
  })
})
