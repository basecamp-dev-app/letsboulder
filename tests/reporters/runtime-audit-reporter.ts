import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { Reporter, Suite, TestCase, TestResult } from '@playwright/test/reporter'
import { AUDIT_VIEWPORTS, type RuntimeAuditEvidence, type RuntimeAuditIssue, type RuntimeAuditState } from '../fixtures/runtime-audit'

type Classification = 'passed' | 'application-finding' | 'fixture-expectation' | 'navigation-race' | 'timeout' | 'browser-crash' | 'missing-evidence-row' | 'test-failure' | 'skipped' | 'interrupted'
type Metadata = { project: string; route: string; state: RuntimeAuditState; viewport: RuntimeAuditEvidence['viewport']; key: string }
type SavedAttachment = { name: string; contentType: string; path?: string }

function metadataFor(test: TestCase): Metadata | undefined {
  const label = test.title.match(/viewport=([^\s]+)/)?.[1]
  const viewport = AUDIT_VIEWPORTS.find(item => item.label === label)
  if (!viewport) return undefined
  const project = test.parent.project()?.name || 'unknown-project'
  const route = test.title.match(/route=([^\s]+)/)?.[1] || (/throttled-route/.test(test.title) ? '/gb/harrisons-rocks/giants-ear' : '/')
  const state = (test.title.match(/state=([^\s]+)/)?.[1] || 'default') as RuntimeAuditState
  return { project, route, state, viewport, key: `${project}:${viewport.label}:${route}:${state}` }
}
function errorText(result: TestResult) { return result.errors.map(error => error.message || '').filter(Boolean).join('\n') }
function classify(result: TestResult, issues: RuntimeAuditIssue[], recorded: boolean): Classification {
  if (result.status === 'passed') return recorded ? 'passed' : 'missing-evidence-row'
  if (result.status === 'skipped') return 'skipped'
  if (result.status === 'interrupted') return 'interrupted'
  if (result.status === 'timedOut') return 'timeout'
  const message = errorText(result)
  if (/browser.*(?:closed|crash|disconnected)|target page, context or browser has been closed|browser has disconnected/i.test(message)) return 'browser-crash'
  if (/execution context was destroyed|frame was detached|page\.goto|navigation/i.test(message)) return 'navigation-race'
  if (issues.some(issue => issue.category !== 'state-fixture')) return 'application-finding'
  if (issues.some(issue => issue.category === 'state-fixture' && /layout evidence could not be collected|execution context|navigation|frame/i.test(issue.details))) return 'navigation-race'
  if (issues.some(issue => issue.category === 'state-fixture')) return 'fixture-expectation'
  return recorded ? 'test-failure' : 'missing-evidence-row'
}
function safe(value: string) { return value.replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 100) || 'test' }

class RuntimeAuditReporter implements Reporter {
  private expected = new Map<string, { testId: string; metadata: Metadata }>()
  private duplicates = new Set<string>()
  private rows = new Map<string, Record<string, unknown>>()
  private attempts: Array<Record<string, unknown>> = []
  private directory = path.resolve(process.cwd(), process.env.RUNTIME_AUDIT_REPORT_DIR || 'runtime-audit-work/report')

  onBegin(_config: unknown, suite: Suite) {
    for (const test of suite.allTests()) {
      const metadata = metadataFor(test)
      if (!metadata) continue
      if (this.expected.has(metadata.key)) this.duplicates.add(metadata.key)
      this.expected.set(metadata.key, { testId: test.id, metadata })
    }
  }

  onTestEnd(test: TestCase, result: TestResult) {
    const metadata = metadataFor(test)
    if (!metadata) return
    mkdirSync(this.directory, { recursive: true })
    const attachments: SavedAttachment[] = []
    let evidence: RuntimeAuditEvidence | undefined
    result.attachments.forEach((attachment, index) => {
      if (attachment.name === 'runtime-audit-evidence' && attachment.body) {
        evidence = JSON.parse(attachment.body.toString()) as RuntimeAuditEvidence
        return
      }
      if (attachment.body) {
        const extension = attachment.contentType === 'image/png' ? '.png' : attachment.contentType === 'image/jpeg' ? '.jpg' : '.bin'
        const file = path.join(this.directory, 'attachments', safe(test.id), `attempt-${result.retry}`, `${index}-${safe(attachment.name)}${extension}`)
        mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, attachment.body)
        attachments.push({ name: attachment.name, contentType: attachment.contentType, path: file })
      } else attachments.push({ name: attachment.name, contentType: attachment.contentType, path: attachment.path })
    })
    const issues = evidence?.issues || []
    this.attempts.push({ ...metadata, testId: test.id, title: test.title, attempt: result.retry, status: result.status, duration: result.duration, errors: result.errors.map(error => ({ message: error.message || '', stack: error.stack })), attachments })
    this.rows.set(metadata.key, {
      ...(evidence || { project: metadata.project, route: metadata.route, state: metadata.state, viewport: metadata.viewport, checks: { horizontalOverflow: 'absent', clippedOverlay: 'absent', hiddenAction: 'absent', keyboardObstruction: 'absent', gestureTrap: 'absent', landscape: metadata.viewport.orientation === 'landscape' ? 'missing' : 'not-applicable' }, issues: [] }),
      testId: test.id, key: metadata.key, recorded: Boolean(evidence), finalStatus: result.status, outcome: result.status, retry: result.retry, attempt: result.retry, classification: classify(result, issues, Boolean(evidence)), ...(errorText(result) ? { error: errorText(result) } : {}),
    })
  }

  onEnd() {
    mkdirSync(this.directory, { recursive: true })
    for (const [key, expected] of this.expected) if (!this.rows.has(key)) this.rows.set(key, {
      project: expected.metadata.project, route: expected.metadata.route, state: expected.metadata.state, viewport: expected.metadata.viewport,
      checks: { horizontalOverflow: 'absent', clippedOverlay: 'absent', hiddenAction: 'absent', keyboardObstruction: 'absent', gestureTrap: 'absent', landscape: expected.metadata.viewport.orientation === 'landscape' ? 'missing' : 'not-applicable' }, issues: [],
      testId: expected.testId, key, recorded: false, finalStatus: 'missing', attempt: -1, classification: 'missing-evidence-row', error: 'Playwright did not report a final result for this expected row.',
    })
    writeFileSync(path.join(this.directory, 'runtime-audit-reporter.json'), `${JSON.stringify({ schemaVersion: 2, generatedAt: new Date().toISOString(), expectedRowCount: this.expected.size, duplicateExpectedKeys: [...this.duplicates].sort(), expectedKeys: [...this.expected.keys()].sort(), rows: [...this.rows.values()].sort((a, b) => String(a.key).localeCompare(String(b.key))), attempts: this.attempts }, null, 2)}\n`)
  }
}
export default RuntimeAuditReporter
