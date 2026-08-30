import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const artifactScript = path.join(root, 'scripts', 'playwright', 'runtime-audit-artifacts.mjs')
const read = (file: string) => readFileSync(path.join(root, file), 'utf8')
const put = (file: string, value: string) => { mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, value) }

describe('runtime audit artifact contracts', () => {
  it('separates routine summary and final-failure evidence', () => {
    const config = read('playwright.runtime-audit.config.ts')
    const nightly = read('.github/workflows/e2e-production-nightly.yml').split('  production-mobile-runtime-audit:')[1]
    expect(config).toContain("['line']")
    expect(config).toContain("screenshot: 'off'")
    expect(config).toContain("'retain-on-failure'")
    expect(nightly).not.toContain('playwright-report\n            test-results')
    expect(nightly).toContain('runtime-audit-summary-${{ github.run_id }}')
    expect(nightly).toContain('runtime-audit-failures-chromium-${{ github.run_id }}')
    expect(nightly).toContain('runtime-audit-failures-webkit-${{ github.run_id }}')
  })

  it('keeps the staging audit anonymous and read-only', () => {
    const fixture = read('tests/fixtures/runtime-audit.ts')
    const workflow = read('.github/workflows/runtime-audit-staging.yml')
    expect(fixture).toContain("!['GET', 'HEAD', 'OPTIONS'].includes(request.method())")
    expect(fixture).toContain('Runtime audits must never mutate production or staging data')
    expect(workflow).toContain("PLAYWRIGHT_BASE_URL: 'https://staging.letsboulder.com'")
    expect(workflow).not.toMatch(/secrets\.(?:SUPABASE_SERVICE_ROLE_KEY|TEST_USER|TEST_API_KEY)/)
  })

  it('drops flaky-pass recordings and retains one final-failure bundle', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'runtime-audit-'))
    const work = path.join(dir, 'runtime-audit-work'), reportDir = path.join(work, 'report'), results = path.join(work, 'test-results'), output = path.join(dir, 'out')
    const shot = path.join(reportDir, 'attachments', 'failed', 'attempt-0', 'shot.png'), video = path.join(results, 'failed', 'video.webm'), trace = path.join(results, 'failed', 'trace.zip'), flakyVideo = path.join(results, 'flaky', 'video.webm'), flakyTrace = path.join(results, 'flaky', 'trace.zip')
    for (const [file, value] of [[shot, 'png'], [video, 'video'], [trace, 'trace'], [flakyVideo, 'old-video'], [flakyTrace, 'old-trace']]) put(file, value)
    const viewport = { label: 'mobile-390', width: 390, height: 844, orientation: 'portrait' }
    const checks = { horizontalOverflow: 'logged', clippedOverlay: 'absent', hiddenAction: 'absent', keyboardObstruction: 'absent', gestureTrap: 'absent', landscape: 'not-applicable' }
    const reporter = { expectedRowCount: 2, duplicateExpectedKeys: [], rows: [
      { testId: 'failed', key: 'mobile-chrome:mobile-390:/about:default', project: 'mobile-chrome', route: '/about', state: 'default', viewport, checks, issues: [{ category: 'horizontal-overflow', details: 'overflow' }], recorded: true, finalStatus: 'failed', attempt: 0, classification: 'application-finding' },
      { testId: 'flaky', key: 'mobile-chrome:mobile-390:/impact:default', project: 'mobile-chrome', route: '/impact', state: 'default', viewport, checks: { ...checks, horizontalOverflow: 'absent' }, issues: [], recorded: true, finalStatus: 'passed', attempt: 1, classification: 'passed' },
    ], attempts: [
      { testId: 'failed', key: 'mobile-chrome:mobile-390:/about:default', attempt: 0, attachments: [{ name: 'runtime-audit-screenshot', contentType: 'image/png', path: shot }, { name: 'video', contentType: 'video/webm', path: video }, { name: 'trace', contentType: 'application/zip', path: trace }] },
      { testId: 'flaky', key: 'mobile-chrome:mobile-390:/impact:default', attempt: 0, attachments: [{ name: 'video', contentType: 'video/webm', path: flakyVideo }, { name: 'trace', contentType: 'application/zip', path: flakyTrace }] },
      { testId: 'flaky', key: 'mobile-chrome:mobile-390:/impact:default', attempt: 1, attachments: [] },
    ] }
    mkdirSync(reportDir, { recursive: true }); const report = path.join(reportDir, 'runtime-audit-reporter.json'); writeFileSync(report, JSON.stringify(reporter))
    execFileSync(process.execPath, [artifactScript, 'finalize', '--report', report, '--work', work, '--output', output, '--run-id', '123', '--expected-rows', '2'])
    const manifest = JSON.parse(readFileSync(path.join(output, 'summary', 'runtime-audit-artifact-manifest.json'), 'utf8'))
    const matrix = JSON.parse(readFileSync(path.join(output, 'summary', 'runtime-audit-evidence.json'), 'utf8'))
    expect(manifest.files).toHaveLength(3)
    expect(manifest.files.map((file: { artifactType: string }) => file.artifactType).sort()).toEqual(['screenshot', 'trace', 'video'])
    expect(manifest.files.every((file: { testId: string; sha256: string }) => file.testId === 'failed' && /^[a-f0-9]{64}$/.test(file.sha256))).toBe(true)
    expect(matrix.validationErrors).toEqual([])
    expect(matrix.rows.find((row: { testId: string }) => row.testId === 'flaky').retainedEvidence).toEqual([])
  })
})
